const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isTransientFetchError,
  formatUpstreamFetchError,
  runWithTransientRetry,
} = require("../server/services/fetch-timeout");

test("isTransientFetchError detects undici fetch failed", () => {
  const err = new Error("fetch failed");
  err.cause = Object.assign(new Error("connect ECONNRESET"), { code: "ECONNRESET" });
  assert.equal(isTransientFetchError(err), true);
});

test("isTransientFetchError ignores HTTP and timeout errors", () => {
  const httpErr = new Error("mileage_required");
  httpErr.status = 400;
  assert.equal(isTransientFetchError(httpErr), false);

  const timeoutErr = new Error("upstream_timeout");
  timeoutErr.code = "upstream_timeout";
  timeoutErr.status = 504;
  assert.equal(isTransientFetchError(timeoutErr), false);
});

test("formatUpstreamFetchError appends cause code", () => {
  const err = new Error("fetch failed");
  err.cause = { code: "ECONNRESET", message: "read ECONNRESET" };
  assert.match(formatUpstreamFetchError(err), /ECONNRESET/);
});

test("runWithTransientRetry recovers after transient failures", async () => {
  let attempts = 0;
  const value = await runWithTransientRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error("fetch failed");
        err.cause = { code: "ECONNRESET" };
        throw err;
      }
      return "ok";
    },
    { attempts: 3, delayMs: 1 },
  );
  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});

test("runWithTransientRetry does not retry business errors", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      runWithTransientRetry(
        async () => {
          attempts += 1;
          const err = new Error("mileage_required");
          err.status = 400;
          throw err;
        },
        { attempts: 3, delayMs: 1 },
      ),
    /mileage_required/,
  );
  assert.equal(attempts, 1);
});
