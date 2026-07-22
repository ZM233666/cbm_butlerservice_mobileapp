/**
 * 生产环境多 worker：上传等 CPU/IO 密集请求并行处理，缓解单进程排队。
 * Docker / npm start:prod 默认走此入口；开发 `npm run dev` 仍单进程便于调试。
 *
 * Primary 额外承担认证上游全局协调：跨 worker 同 Token 合并、全局限流、共享熔断。
 */
require("dotenv").config();

const cluster = require("node:cluster");
const os = require("node:os");
const { info, error } = require("./lib/logger");
const { positiveInt } = require("./services/django-auth");
const { createAuthUpstreamClusterPrimary } = require("./services/auth-upstream-cluster");
const { upstreamTimeoutMs } = require("./services/fetch-timeout");

function resolveWorkerCount(env = process.env) {
  const raw = Number.parseInt(String(env.NODE_CLUSTER_WORKERS || ""), 10);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 16);
  const cpus = os.cpus().length;
  // 未显式配置时：至少 4，最多 8（上传并行度；建议 8 核 + SSD）
  return Math.min(Math.max(4, cpus), 8);
}

function shouldUseCluster(env = process.env) {
  const raw = String(env.NODE_CLUSTER_ENABLED || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return String(env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function startClusterPrimary(workerCount) {
  const globalMax = positiveInt(process.env.AUTH_UPSTREAM_MAX_CONCURRENCY, 16);
  const queueMax = positiveInt(process.env.AUTH_UPSTREAM_QUEUE_MAX, 64);
  const queueWaitMs = positiveInt(process.env.AUTH_UPSTREAM_QUEUE_WAIT_MS, 3000);
  const leaseTimeoutMs = upstreamTimeoutMs("GET") + queueWaitMs + 2000;
  const authPrimary = createAuthUpstreamClusterPrimary({
    maxConcurrent: globalMax,
    maxQueue: queueMax,
    queueWaitMs,
    leaseTimeoutMs,
    cacheTtlMs: positiveInt(process.env.AUTH_CACHE_TTL_MS, 300_000),
  });
  authPrimary.attach(cluster);

  info(`ButlerService cluster primary pid=${process.pid} workers=${workerCount}`);
  info(
    `Auth upstream global limit: ${globalMax}` +
      ` (queueMax=${queueMax}, queueWaitMs=${queueWaitMs}, leaseTimeoutMs=${leaseTimeoutMs})`,
  );

  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    error(`Worker pid=${worker.process.pid} exited code=${code} signal=${signal}; restarting`);
    cluster.fork();
  });
}

function main() {
  if (!shouldUseCluster()) {
    require("./server.js");
    return;
  }
  if (cluster.isPrimary) {
    startClusterPrimary(resolveWorkerCount());
    return;
  }
  require("./server.js");
}

if (require.main === module) {
  main();
}

module.exports = { resolveWorkerCount, shouldUseCluster, startClusterPrimary };
