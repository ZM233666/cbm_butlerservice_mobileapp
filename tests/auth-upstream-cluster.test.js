const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  createAuthCache,
  createDjangoUserInfoFetcher,
  createInFlightMap,
  createConcurrencyLimiter,
} = require("../server/services/django-auth");
const {
  createAuthUpstreamClusterPrimary,
  createAuthUpstreamClusterWorker,
  TYPE_BEGIN,
  TYPE_PROCEED,
  TYPE_COMPLETE,
  TYPE_RESULT,
} = require("../server/services/auth-upstream-cluster");
const { runWithTimeout } = require("../server/services/fetch-timeout");

function tokenCacheKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

function createFakeWorker(id, inbox) {
  return {
    id,
    isConnected: () => true,
    isDead: () => false,
    send(msg) {
      inbox.push({ workerId: id, msg });
    },
  };
}

test("cluster primary coalesces same cacheKey across workers to one proceed", async () => {
  const primary = createAuthUpstreamClusterPrimary({
    maxConcurrent: 2,
    maxQueue: 16,
    queueWaitMs: 2000,
    leaseTimeoutMs: 5000,
  });
  const inbox = [];
  const w1 = createFakeWorker(1, inbox);
  const w2 = createFakeWorker(2, inbox);
  const cacheKey = tokenCacheKey("shared-token");

  primary.onMessage(w1, { type: TYPE_BEGIN, requestId: "r1", cacheKey });
  primary.onMessage(w2, { type: TYPE_BEGIN, requestId: "r2", cacheKey });

  const proceeds = inbox.filter((x) => x.msg.type === TYPE_PROCEED);
  assert.equal(proceeds.length, 1);
  assert.equal(proceeds[0].workerId, 1);
  assert.equal(primary.getStats().active, 1);

  primary.onMessage(w1, {
    type: TYPE_COMPLETE,
    requestId: "r1",
    cacheKey,
    ok: true,
    data: { username: "20005303" },
    negative: false,
  });

  const results = inbox.filter((x) => x.msg.type === TYPE_RESULT);
  assert.equal(results.length, 1);
  assert.equal(results[0].workerId, 2);
  assert.equal(results[0].msg.data.username, "20005303");
  assert.equal(primary.getStats().active, 0);
});

test("cluster primary enforces global concurrency across different keys", async () => {
  const primary = createAuthUpstreamClusterPrimary({
    maxConcurrent: 1,
    maxQueue: 16,
    queueWaitMs: 2000,
    leaseTimeoutMs: 5000,
  });
  const inbox = [];
  const w1 = createFakeWorker(1, inbox);
  const w2 = createFakeWorker(2, inbox);

  primary.onMessage(w1, { type: TYPE_BEGIN, requestId: "a", cacheKey: "key-a" });
  primary.onMessage(w2, { type: TYPE_BEGIN, requestId: "b", cacheKey: "key-b" });

  const proceeds = inbox.filter((x) => x.msg.type === TYPE_PROCEED);
  assert.equal(proceeds.length, 1);
  assert.equal(primary.getStats().active, 1);
  assert.equal(primary.getStats().queued, 1);

  primary.onMessage(w1, {
    type: TYPE_COMPLETE,
    requestId: "a",
    cacheKey: "key-a",
    ok: true,
    data: { username: "a" },
  });

  const proceedsAfter = inbox.filter((x) => x.msg.type === TYPE_PROCEED);
  assert.equal(proceedsAfter.length, 2);
  assert.equal(primary.getStats().queued, 0);
});

test("cluster worker client + fetcher: same token across two clients hits upstream once", async () => {
  let upstreamCalls = 0;
  const primary = createAuthUpstreamClusterPrimary({
    maxConcurrent: 4,
    maxQueue: 32,
    queueWaitMs: 3000,
    leaseTimeoutMs: 5000,
  });

  function attachWorker(id) {
    let onMsg = null;
    const fakeWorker = {
      id,
      isConnected: () => true,
      isDead: () => false,
      send(msg) {
        if (onMsg) onMsg(msg);
      },
    };
    return createAuthUpstreamClusterWorker({
      requestIdPrefix: `w${id}`,
      send: (msg) => primary.onMessage(fakeWorker, msg),
      subscribe: (handler) => {
        onMsg = handler;
      },
    });
  }

  const c1 = attachWorker(1);
  const c2 = attachWorker(2);

  const makeFetcher = (coordinator) => {
    const cache = createAuthCache({ ttlMs: 60_000 });
    return createDjangoUserInfoFetcher({
      cache,
      tokenCacheKey,
      runWithTimeout,
      getTimeoutMs: () => 3000,
      getUpstreamUrl: () => "http://example.test/user_info/",
      limiter: createConcurrencyLimiter({ maxConcurrent: 8, maxQueue: 8, queueWaitMs: 1000 }),
      inFlight: createInFlightMap(),
      clusterCoordinator: coordinator,
      fetchImpl: async () => {
        upstreamCalls += 1;
        await delay(20);
        return mockResponse(200, {
          code: 2000,
          data: { username: "20005303", name: "T", role_info: [{ key: "FSE" }] },
        });
      },
    });
  };

  const f1 = makeFetcher(c1);
  const f2 = makeFetcher(c2);
  const token = "cluster-shared-jwt";

  const [a, b] = await Promise.all([
    f1.fetchDjangoUserInfo(token),
    f2.fetchDjangoUserInfo(token),
  ]);

  assert.equal(upstreamCalls, 1);
  assert.equal(a.username, "20005303");
  assert.equal(b.username, "20005303");
});

test("cluster worker requestIdPrefix avoids collisions across fake workers", async () => {
  const primary = createAuthUpstreamClusterPrimary({
    maxConcurrent: 4,
    maxQueue: 16,
    queueWaitMs: 2000,
    leaseTimeoutMs: 3000,
  });
  const seen = new Set();

  function attachWorker(id) {
    let onMsg = null;
    const fakeWorker = {
      id,
      isConnected: () => true,
      isDead: () => false,
      send(msg) {
        if (onMsg) onMsg(msg);
      },
    };
    return createAuthUpstreamClusterWorker({
      requestIdPrefix: `w${id}`,
      send: (msg) => {
        if (msg.type === TYPE_BEGIN) {
          assert.ok(!seen.has(msg.requestId), `duplicate requestId ${msg.requestId}`);
          seen.add(msg.requestId);
        }
        primary.onMessage(fakeWorker, msg);
      },
      subscribe: (handler) => {
        onMsg = handler;
      },
    });
  }

  const c1 = attachWorker(1);
  const c2 = attachWorker(2);
  await Promise.all([
    c1.run("key-x", async () => ({ ok: 1 })),
    c2.run("key-x", async () => ({ ok: 1 })),
  ]);
  assert.equal(seen.size, 2);
});
