const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveWorkerCount, shouldUseCluster } = require("../server/cluster");

test("resolveWorkerCount respects NODE_CLUSTER_WORKERS", () => {
  assert.equal(resolveWorkerCount({ NODE_CLUSTER_WORKERS: "8" }), 8);
  assert.equal(resolveWorkerCount({ NODE_CLUSTER_WORKERS: "99" }), 16);
});

test("resolveWorkerCount defaults up to 8 when unset", () => {
  const n = resolveWorkerCount({});
  assert.ok(n >= 4 && n <= 8);
});

test("shouldUseCluster follows explicit flag and NODE_ENV", () => {
  assert.equal(shouldUseCluster({ NODE_CLUSTER_ENABLED: "0", NODE_ENV: "production" }), false);
  assert.equal(shouldUseCluster({ NODE_CLUSTER_ENABLED: "1", NODE_ENV: "development" }), true);
  assert.equal(shouldUseCluster({ NODE_ENV: "production" }), true);
  assert.equal(shouldUseCluster({ NODE_ENV: "development" }), false);
});
