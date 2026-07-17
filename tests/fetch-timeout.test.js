const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_WRITE_TIMEOUT_MS,
  upstreamTimeoutMs,
  runWithTimeout,
} = require("../server/services/fetch-timeout");

test("upstream timeout defaults distinguish reads and writes", () => {
  assert.equal(upstreamTimeoutMs("GET", {}), DEFAULT_READ_TIMEOUT_MS);
  assert.equal(upstreamTimeoutMs("HEAD", {}), DEFAULT_READ_TIMEOUT_MS);
  assert.equal(upstreamTimeoutMs("POST", {}), DEFAULT_WRITE_TIMEOUT_MS);
  assert.equal(upstreamTimeoutMs("PATCH", {}), DEFAULT_WRITE_TIMEOUT_MS);
});

test("upstream timeout values can be configured", () => {
  const env = { UPSTREAM_READ_TIMEOUT_MS: "45000", UPSTREAM_WRITE_TIMEOUT_MS: "120000" };
  assert.equal(upstreamTimeoutMs("GET", env), 45_000);
  assert.equal(upstreamTimeoutMs("POST", env), 120_000);
});

test("runWithTimeout converts an expired request to a 504 timeout error", async () => {
  const neverCompletes = (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(
    runWithTimeout(neverCompletes, 10),
    (err) => err && err.code === "upstream_timeout" && err.status === 504,
  );
});

test("runWithTimeout returns successful values before the deadline", async () => {
  const response = { ok: true };
  const result = await runWithTimeout(async () => response, 100);
  assert.equal(result, response);
});
