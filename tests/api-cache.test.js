const test = require("node:test");
const assert = require("node:assert/strict");
const { createApiCache } = require("../server/lib/api-cache");

test("createApiCache dedupes concurrent loads", async () => {
  const cache = createApiCache({ defaultTtlMs: 1000 });
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { ok: true };
  };

  const [a, b] = await Promise.all([
    cache.getOrLoad("k1", loader),
    cache.getOrLoad("k1", loader),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { ok: true });
  assert.deepEqual(b, { ok: true });

  const hit = await cache.getOrLoad("k1", loader);
  assert.equal(calls, 1);
  assert.deepEqual(hit, { ok: true });
});

test("createApiCache delPrefix clears grouped keys", async () => {
  const cache = createApiCache({ defaultTtlMs: 1000 });
  cache.set("home-config:u1", { tasks: [] });
  cache.set("home-config:u2", { tasks: [] });
  cache.set("task-status:u1", { statuses: {} });
  cache.delPrefix("home-config:");
  assert.equal(cache.get("home-config:u1"), undefined);
  assert.equal(cache.get("home-config:u2"), undefined);
  assert.deepEqual(cache.get("task-status:u1"), { statuses: {} });
});
