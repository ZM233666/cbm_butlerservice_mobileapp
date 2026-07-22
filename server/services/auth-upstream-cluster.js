"use strict";

const {
  positiveInt,
  createAuthCache,
  createAuthUpstreamError,
} = require("./django-auth");

const TYPE_BEGIN = "auth_upstream_begin";
const TYPE_PROCEED = "auth_upstream_proceed";
const TYPE_COMPLETE = "auth_upstream_complete";
const TYPE_FAIL = "auth_upstream_fail";
const TYPE_RESULT = "auth_upstream_result";

function safeSend(worker, message) {
  if (!worker || !worker.isConnected || !worker.isConnected()) return false;
  try {
    worker.send(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cluster primary：全局鉴权上游协调（跨 worker 合并 / 限流 / 熔断）。
 * IPC 只传 cacheKey（SHA-256）与结果，不传明文 JWT。
 */
function createAuthUpstreamClusterPrimary(options = {}) {
  const maxConcurrent = Math.max(1, positiveInt(options.maxConcurrent, 16));
  const maxQueue = Math.max(0, positiveInt(options.maxQueue, 64));
  const queueWaitMs = Math.max(1, positiveInt(options.queueWaitMs, 3000));
  const leaseTimeoutMs = Math.max(1000, positiveInt(options.leaseTimeoutMs, 35_000));
  const cache = options.cache || createAuthCache({
    ttlMs: positiveInt(options.cacheTtlMs, 300_000),
    negativeTtlMs: 60_000,
  });

  let circuitOpenUntil = 0;
  /** @type {Map<string, { ownerWorkerId: number, ownerRequestId: string, waiters: Array<{worker: any, requestId: string}>, timer: NodeJS.Timeout }>} */
  const active = new Map();
  /** @type {Array<{ cacheKey: string, waiters: Array<{worker: any, requestId: string}>, timer: NodeJS.Timeout }>} */
  const pendingQueue = [];

  function isCircuitOpen() {
    return Date.now() < circuitOpenUntil;
  }

  function openCircuit(ms) {
    const hold = Math.max(0, Number(ms) || 0);
    circuitOpenUntil = Math.max(circuitOpenUntil, Date.now() + hold);
  }

  function replyError(worker, requestId, code, status, message) {
    safeSend(worker, {
      type: TYPE_RESULT,
      requestId,
      ok: false,
      error: { code, status, message: message || code },
    });
  }

  function replyData(worker, requestId, data) {
    safeSend(worker, {
      type: TYPE_RESULT,
      requestId,
      ok: true,
      data,
    });
  }

  function findPending(cacheKey) {
    return pendingQueue.find((item) => item.cacheKey === cacheKey) || null;
  }

  function removePending(item) {
    const idx = pendingQueue.indexOf(item);
    if (idx >= 0) pendingQueue.splice(idx, 1);
    if (item.timer) clearTimeout(item.timer);
  }

  function failWaiters(waiters, code, status, message) {
    for (const waiter of waiters) {
      replyError(waiter.worker, waiter.requestId, code, status, message);
    }
  }

  function releaseActive(cacheKey) {
    const entry = active.get(cacheKey);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    active.delete(cacheKey);
    pump();
  }

  function pump() {
    while (active.size < maxConcurrent && pendingQueue.length > 0) {
      const item = pendingQueue.shift();
      if (!item) break;
      if (item.timer) clearTimeout(item.timer);

      if (isCircuitOpen()) {
        failWaiters(
          item.waiters,
          "auth_upstream_circuit_open",
          503,
          "auth_upstream_unavailable",
        );
        continue;
      }

      const owner = item.waiters[0];
      if (!owner || !owner.worker || (owner.worker.isDead && owner.worker.isDead())) {
        failWaiters(
          item.waiters.slice(1),
          "auth_upstream_unavailable",
          503,
          "auth_upstream_unavailable",
        );
        continue;
      }

      const entry = {
        ownerWorkerId: owner.worker.id,
        ownerRequestId: owner.requestId,
        waiters: item.waiters,
        timer: setTimeout(() => {
          const current = active.get(item.cacheKey);
          if (!current || current.ownerRequestId !== owner.requestId) return;
          failWaiters(
            current.waiters,
            "auth_upstream_unavailable",
            503,
            "auth_upstream_unavailable",
          );
          active.delete(item.cacheKey);
          pump();
        }, leaseTimeoutMs),
      };
      active.set(item.cacheKey, entry);
      if (!safeSend(owner.worker, { type: TYPE_PROCEED, requestId: owner.requestId, cacheKey: item.cacheKey })) {
        failWaiters(
          item.waiters,
          "auth_upstream_unavailable",
          503,
          "auth_upstream_unavailable",
        );
        releaseActive(item.cacheKey);
      }
    }
  }

  function enqueueBegin(worker, requestId, cacheKey) {
    const existingActive = active.get(cacheKey);
    if (existingActive) {
      existingActive.waiters.push({ worker, requestId });
      return;
    }

    const existingPending = findPending(cacheKey);
    if (existingPending) {
      existingPending.waiters.push({ worker, requestId });
      return;
    }

    if (active.size >= maxConcurrent && pendingQueue.length >= maxQueue) {
      replyError(worker, requestId, "auth_upstream_queue_full", 503, "auth_upstream_unavailable");
      return;
    }

    const item = {
      cacheKey,
      waiters: [{ worker, requestId }],
      timer: null,
    };
    item.timer = setTimeout(() => {
      removePending(item);
      failWaiters(
        item.waiters,
        "auth_upstream_queue_timeout",
        503,
        "auth_upstream_unavailable",
      );
    }, queueWaitMs);
    pendingQueue.push(item);
    pump();
  }

  function handleBegin(worker, msg) {
    const requestId = String(msg.requestId || "");
    const cacheKey = String(msg.cacheKey || "");
    if (!requestId || !cacheKey) return;

    if (isCircuitOpen()) {
      replyError(worker, requestId, "auth_upstream_circuit_open", 503, "auth_upstream_unavailable");
      return;
    }
    if (cache.has(cacheKey)) {
      replyData(worker, requestId, cache.get(cacheKey));
      return;
    }
    enqueueBegin(worker, requestId, cacheKey);
  }

  function handleComplete(worker, msg) {
    const cacheKey = String(msg.cacheKey || "");
    const requestId = String(msg.requestId || "");
    const entry = active.get(cacheKey);
    if (!entry || entry.ownerRequestId !== requestId) return;

    if (msg.negative || msg.data == null) {
      cache.setNegative(cacheKey);
    } else {
      cache.set(cacheKey, msg.data);
    }

    for (const waiter of entry.waiters) {
      if (waiter.requestId === entry.ownerRequestId) continue;
      replyData(waiter.worker, waiter.requestId, msg.negative ? null : msg.data);
    }
    releaseActive(cacheKey);
  }

  function handleFail(worker, msg) {
    const cacheKey = String(msg.cacheKey || "");
    const requestId = String(msg.requestId || "");
    const entry = active.get(cacheKey);
    if (!entry || entry.ownerRequestId !== requestId) return;

    if (msg.openCircuitMs) openCircuit(msg.openCircuitMs);
    const err = msg.error || {};
    const code = String(err.code || "auth_upstream_unavailable");
    const status = Number(err.status) || 503;
    const message = String(err.message || code);

    for (const waiter of entry.waiters) {
      if (waiter.requestId === entry.ownerRequestId) continue;
      replyError(waiter.worker, waiter.requestId, code, status, message);
    }
    releaseActive(cacheKey);
  }

  function onMessage(worker, msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === TYPE_BEGIN) return handleBegin(worker, msg);
    if (msg.type === TYPE_COMPLETE) return handleComplete(worker, msg);
    if (msg.type === TYPE_FAIL) return handleFail(worker, msg);
  }

  function onWorkerExit(workerId) {
    for (const [cacheKey, entry] of active.entries()) {
      if (entry.ownerWorkerId !== workerId) continue;
      failWaiters(
        entry.waiters.filter((w) => w.requestId !== entry.ownerRequestId),
        "auth_upstream_unavailable",
        503,
        "auth_upstream_unavailable",
      );
      releaseActive(cacheKey);
    }
    for (let i = pendingQueue.length - 1; i >= 0; i -= 1) {
      const item = pendingQueue[i];
      item.waiters = item.waiters.filter((w) => w.worker.id !== workerId);
      if (!item.waiters.length) {
        removePending(item);
      }
    }
  }

  function attach(cluster) {
    cluster.on("message", (worker, msg) => onMessage(worker, msg));
    cluster.on("exit", (worker) => onWorkerExit(worker.id));
  }

  return {
    attach,
    onMessage,
    onWorkerExit,
    getStats() {
      return {
        active: active.size,
        queued: pendingQueue.length,
        maxConcurrent,
        circuitOpen: isCircuitOpen(),
      };
    },
  };
}

/**
 * Worker 侧协调客户端：向 primary 申请合并/限流槽，本进程执行真实上游请求。
 */
function createAuthUpstreamClusterWorker(options = {}) {
  const send = options.send || ((msg) => process.send && process.send(msg));
  let seq = 0;
  /** @type {Map<string, { resolve: Function, reject: Function, onProceed: Function }>} */
  const pending = new Map();

  function onMessage(msg) {
    if (!msg || typeof msg !== "object") return;
    const requestId = String(msg.requestId || "");
    const entry = pending.get(requestId);
    if (!entry) return;

    if (msg.type === TYPE_PROCEED) {
      void entry.onProceed();
      return;
    }
    if (msg.type === TYPE_RESULT) {
      pending.delete(requestId);
      if (msg.ok) entry.resolve(msg.data);
      else {
        const err = msg.error || {};
        entry.reject(
          createAuthUpstreamError(
            String(err.code || "auth_upstream_unavailable"),
            Number(err.status) || 503,
            String(err.message || err.code || "auth_upstream_unavailable"),
          ),
        );
      }
    }
  }

  if (typeof options.subscribe === "function") {
    options.subscribe(onMessage);
  } else if (typeof process.on === "function") {
    process.on("message", onMessage);
  }

  async function run(cacheKey, executeUpstream) {
    const key = String(cacheKey || "");
    const prefix = String(options.requestIdPrefix || `p${process.pid}`);
    const requestId = `${prefix}-${Date.now().toString(36)}-${++seq}`;

    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        onProceed: async () => {
          try {
            const data = await executeUpstream();
            send({
              type: TYPE_COMPLETE,
              requestId,
              cacheKey: key,
              ok: true,
              data,
              negative: data == null,
            });
            pending.delete(requestId);
            resolve(data);
          } catch (err) {
            const code = String((err && err.code) || "auth_upstream_unavailable");
            const status = Number((err && err.status) || 503);
            const openCircuitMs =
              code === "auth_upstream_db_saturated"
                ? 60_000
                : code === "upstream_timeout" || status === 504 || status === 503
                  ? 30_000
                  : 0;
            send({
              type: TYPE_FAIL,
              requestId,
              cacheKey: key,
              error: {
                code,
                status,
                message: String((err && err.message) || code),
              },
              openCircuitMs,
            });
            pending.delete(requestId);
            reject(err);
          }
        },
      };
      pending.set(requestId, entry);
      try {
        send({ type: TYPE_BEGIN, requestId, cacheKey: key });
      } catch (err) {
        pending.delete(requestId);
        reject(
          createAuthUpstreamError(
            "auth_upstream_unavailable",
            503,
            "auth_upstream_unavailable",
          ),
        );
      }
    });
  }

  return { run, onMessage, size: () => pending.size };
}

module.exports = {
  TYPE_BEGIN,
  TYPE_PROCEED,
  TYPE_COMPLETE,
  TYPE_FAIL,
  TYPE_RESULT,
  createAuthUpstreamClusterPrimary,
  createAuthUpstreamClusterWorker,
};
