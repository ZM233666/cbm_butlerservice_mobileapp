const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  createAuthCache,
  createInFlightMap,
  createConcurrencyLimiter,
  createDjangoUserInfoFetcher,
  resolveAuthUpstreamWorkerLimit,
  createAuthUpstreamError,
} = require("../server/services/django-auth");
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

test("resolveAuthUpstreamWorkerLimit splits global budget across workers", () => {
  assert.equal(
    resolveAuthUpstreamWorkerLimit({
      AUTH_UPSTREAM_MAX_CONCURRENCY: "16",
      NODE_CLUSTER_WORKERS: "8",
      NODE_CLUSTER_ENABLED: "1",
    }),
    2,
  );
  assert.equal(
    resolveAuthUpstreamWorkerLimit({
      AUTH_UPSTREAM_MAX_CONCURRENCY: "16",
      NODE_CLUSTER_ENABLED: "0",
    }),
    16,
  );
});

test("api-cache getOrLoad coalesces concurrent profile loads for same key", async () => {
  const { createApiCache } = require("../server/lib/api-cache");
  let profileCalls = 0;
  const cache = createApiCache({ defaultTtlMs: 60_000 });
  const load = () =>
    cache.getOrLoad("user-profile:20005303", async () => {
      profileCalls += 1;
      await delay(30);
      return { employeeId: "20005303", role: "fse" };
    });

  const results = await Promise.all(Array.from({ length: 20 }, () => load()));
  assert.equal(profileCalls, 1);
  assert.equal(results.length, 20);
  assert.equal(results[0].employeeId, "20005303");
});

test("same token concurrent calls coalesce to one upstream request", async () => {
  let upstreamCalls = 0;
  const cache = createAuthCache({ ttlMs: 60_000 });
  const inFlight = createInFlightMap();
  const limiter = createConcurrencyLimiter({ maxConcurrent: 8, maxQueue: 64, queueWaitMs: 3000 });
  const { fetchDjangoUserInfo } = createDjangoUserInfoFetcher({
    cache,
    tokenCacheKey,
    runWithTimeout,
    getTimeoutMs: () => 5000,
    getUpstreamUrl: () => "http://example.test/user_info/",
    limiter,
    inFlight,
    fetchImpl: async () => {
      upstreamCalls += 1;
      await delay(40);
      return mockResponse(200, {
        code: 2000,
        data: { username: "20005303", name: "Tester", role_info: [{ key: "FSE" }] },
      });
    },
  });

  const token = "same.jwt.token.value";
  const results = await Promise.all(
    Array.from({ length: 20 }, () => fetchDjangoUserInfo(token)),
  );

  assert.equal(upstreamCalls, 1);
  assert.equal(inFlight.size(), 0);
  assert.equal(results.length, 20);
  results.forEach((row) => assert.equal(row.username, "20005303"));
  assert.equal(tokenCacheKey(token).length, 64);
  assert.doesNotMatch(tokenCacheKey(token), /same\.jwt/);
});

test("different tokens respect concurrency limiter", async () => {
  let inFlightUpstream = 0;
  let peak = 0;
  const cache = createAuthCache({ ttlMs: 60_000 });
  const inFlight = createInFlightMap();
  const limiter = createConcurrencyLimiter({ maxConcurrent: 2, maxQueue: 100, queueWaitMs: 5000 });
  const { fetchDjangoUserInfo } = createDjangoUserInfoFetcher({
    cache,
    tokenCacheKey,
    runWithTimeout,
    getTimeoutMs: () => 5000,
    getUpstreamUrl: () => "http://example.test/user_info/",
    limiter,
    inFlight,
    fetchImpl: async (_url, init) => {
      inFlightUpstream += 1;
      peak = Math.max(peak, inFlightUpstream);
      await delay(30);
      inFlightUpstream -= 1;
      const auth = String(init.headers.Authorization || "");
      return mockResponse(200, {
        code: 2000,
        data: { username: auth.slice(-4), name: "U", role_info: [{ key: "FSE" }] },
      });
    },
  });

  await Promise.all(
    Array.from({ length: 10 }, (_, i) => fetchDjangoUserInfo(`token-${i}-${Date.now()}`)),
  );

  assert.ok(peak <= 2, `peak concurrency ${peak} exceeded limit 2`);
  assert.equal(limiter.getStats().active, 0);
});

test("db saturation and upstream 500 return 503 without negative cache", async () => {
  const cache = createAuthCache({ ttlMs: 60_000, negativeTtlMs: 60_000 });
  const inFlight = createInFlightMap();
  const limiter = createConcurrencyLimiter({ maxConcurrent: 2, maxQueue: 8, queueWaitMs: 1000 });
  let circuitOpen = false;

  const makeFetcher = (fetchImpl) =>
    createDjangoUserInfoFetcher({
      cache,
      tokenCacheKey,
      runWithTimeout,
      getTimeoutMs: () => 200,
      getUpstreamUrl: () => "http://example.test/user_info/",
      limiter,
      inFlight,
      isCircuitOpen: () => circuitOpen,
      openCircuit: () => {
        circuitOpen = true;
      },
      fetchImpl,
    });

  const saturated = makeFetcher(async () =>
    mockResponse(200, {
      code: 4000,
      msg: 'FATAL: sorry, too many clients already',
    }),
  );
  await assert.rejects(
    () => saturated.fetchDjangoUserInfo("tok-db"),
    (err) => err.status === 503 && err.code === "auth_upstream_db_saturated",
  );
  assert.equal(cache.has(tokenCacheKey("tok-db")), false);

  circuitOpen = false;
  const fiveHundred = makeFetcher(async () => mockResponse(500, { msg: "boom" }));
  await assert.rejects(
    () => fiveHundred.fetchDjangoUserInfo("tok-500"),
    (err) => err.status === 503 && err.code === "auth_upstream_5xx",
  );
  assert.equal(cache.has(tokenCacheKey("tok-500")), false);
});

test("upstream timeout returns 504 and invalid token returns null", async () => {
  const cache = createAuthCache({ ttlMs: 60_000, negativeTtlMs: 60_000 });
  const inFlight = createInFlightMap();
  const limiter = createConcurrencyLimiter({ maxConcurrent: 2, maxQueue: 8, queueWaitMs: 1000 });

  const timedOut = createDjangoUserInfoFetcher({
    cache,
    tokenCacheKey,
    runWithTimeout,
    getTimeoutMs: () => 20,
    getUpstreamUrl: () => "http://example.test/user_info/",
    limiter,
    inFlight,
    fetchImpl: async (_url, init) => {
      await new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    },
  });
  await assert.rejects(
    () => timedOut.fetchDjangoUserInfo("tok-timeout"),
    (err) => err.code === "upstream_timeout" || err.status === 504,
  );
  assert.equal(cache.has(tokenCacheKey("tok-timeout")), false);

  const invalid = createDjangoUserInfoFetcher({
    cache,
    tokenCacheKey,
    runWithTimeout,
    getTimeoutMs: () => 1000,
    getUpstreamUrl: () => "http://example.test/user_info/",
    limiter,
    inFlight,
    fetchImpl: async () => mockResponse(401, { detail: "invalid" }),
  });
  const result = await invalid.fetchDjangoUserInfo("tok-invalid");
  assert.equal(result, null);
  assert.equal(cache.has(tokenCacheKey("tok-invalid")), true);
  assert.equal(cache.get(tokenCacheKey("tok-invalid")), null);
});

test("frontend client clears session only on 401, not 503/504", () => {
  const clientSrc = fs.readFileSync(
    path.join(__dirname, "../frontend/src/api/client.ts"),
    "utf8",
  );
  assert.match(clientSrc, /if \(res\.status === 401 && !retried\)/);
  assert.match(clientSrc, /clearAuthSession\(\)/);
  assert.doesNotMatch(
    clientSrc,
    /if \(res\.status === 503[\s\S]{0,80}clearAuthSession/,
  );
  assert.doesNotMatch(
    clientSrc,
    /if \(res\.status === 504[\s\S]{0,80}clearAuthSession/,
  );
  assert.match(clientSrc, /status >= 500.*服务器繁忙|服务器繁忙[\s\S]*status >= 500/);
});

test("createAuthUpstreamError carries status for middleware mapping", () => {
  const err = createAuthUpstreamError("auth_upstream_unavailable", 503, "auth_upstream_unavailable");
  assert.equal(err.status, 503);
  assert.equal(err.code, "auth_upstream_unavailable");
});
