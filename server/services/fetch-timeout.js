"use strict";

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_WRITE_TIMEOUT_MS = 90_000;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function upstreamTimeoutMs(method = "GET", env = process.env) {
  const normalized = String(method || "GET").trim().toUpperCase();
  const isRead = normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS";
  return isRead
    ? positiveInt(env.UPSTREAM_READ_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS)
    : positiveInt(env.UPSTREAM_WRITE_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS);
}

async function runWithTimeout(operation, timeoutMs) {
  const limit = positiveInt(timeoutMs, DEFAULT_READ_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);
  try {
    return await operation(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("upstream_timeout");
      timeoutError.code = "upstream_timeout";
      timeoutError.status = 504;
      timeoutError.timeoutMs = limit;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_WRITE_TIMEOUT_MS,
  upstreamTimeoutMs,
  runWithTimeout,
};
