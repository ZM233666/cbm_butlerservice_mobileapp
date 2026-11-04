"use strict";

const DEFAULT_READ_TIMEOUT_MS = 30_000;
const DEFAULT_WRITE_TIMEOUT_MS = 90_000;
const DEFAULT_FETCH_ATTEMPTS = 3;
const TRANSIENT_CAUSE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

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

/** Node/undici 调 Django 的尝试次数（含首次），默认 3 */
function upstreamFetchAttempts(env = process.env) {
  return positiveInt(env.UPSTREAM_FETCH_ATTEMPTS, DEFAULT_FETCH_ATTEMPTS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(err) {
  if (!err || err.code === "upstream_timeout") return false;
  const status = Number(err.status);
  if (status >= 400 && status < 600) return false;
  const msg = String(err.message || "").toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  ) {
    return true;
  }
  const cause = err.cause;
  if (!cause) return false;
  const code = String(cause.code || "").toUpperCase();
  if (TRANSIENT_CAUSE_CODES.has(code)) return true;
  const causeMsg = String(cause.message || "").toLowerCase();
  return causeMsg.includes("fetch failed") || causeMsg.includes("other side closed");
}

function formatUpstreamFetchError(err) {
  const base = String((err && err.message) || "upstream_error");
  const cause = err && err.cause;
  if (!cause) return base;
  const code = String(cause.code || "").trim();
  const causeMsg = String(cause.message || "").trim();
  if (code && causeMsg && causeMsg !== base) return `${base}: ${code} ${causeMsg}`;
  if (code) return `${base}: ${code}`;
  if (causeMsg && causeMsg !== base) return `${base}: ${causeMsg}`;
  return base;
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

/**
 * 对瞬时网络错误短退避重试；业务 4xx/5xx 与 upstream_timeout 不重试。
 */
async function runWithTransientRetry(operation, { attempts, delayMs = 120 } = {}) {
  const maxAttempts = positiveInt(attempts, DEFAULT_FETCH_ATTEMPTS);
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientFetchError(err)) {
        if (isTransientFetchError(err) || String(err.message || "").includes("fetch failed")) {
          err.message = formatUpstreamFetchError(err);
        }
        throw err;
      }
      await sleep(delayMs * attempt);
    }
  }
  throw lastErr;
}

module.exports = {
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_WRITE_TIMEOUT_MS,
  DEFAULT_FETCH_ATTEMPTS,
  positiveInt,
  upstreamTimeoutMs,
  upstreamFetchAttempts,
  isTransientFetchError,
  formatUpstreamFetchError,
  runWithTimeout,
  runWithTransientRetry,
};
