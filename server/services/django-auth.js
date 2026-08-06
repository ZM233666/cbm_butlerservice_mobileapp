const VALID_NODE_ROLES = new Set(["fse", "manager"]);

function normalizeText(v) {
  return String(v || "").trim();
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function roleNameImpliesManager(roleName) {
  const name = normalizeText(roleName).toLowerCase();
  if (!name) return false;
  return name.includes("manager") || name.includes("director");
}

function mapDjangoRoleToNode(roleKey, roleName, isSuperuser) {
  const key = normalizeText(roleKey).toLowerCase();
  const name = normalizeText(roleName).toLowerCase();

  // External contractor（仍按 engineer 侧能力，不进 manager API）
  if (key === "ext" || name === "externalcontractor" || key === "contractor" || key === "third_party") {
    return "fse";
  }
  // 与 H5 / 前端对齐：name 含 manager/director，或已知 key
  if (
    key === "fsd" ||
    key === "fieldservicedirector" ||
    name.includes("director")
  ) {
    return "manager";
  }
  if (
    key === "fsm" ||
    key === "fieldservicemanager" ||
    key === "rsm" ||
    key === "rsmanager" ||
    key === "regionalservicemanager" ||
    key === "admin" ||
    key === "superadmin" ||
    roleNameImpliesManager(roleName) ||
    isSuperuser
  ) {
    return "manager";
  }
  return "fse";
}

function mapDjangoUserInfoToLocalUser(data) {
  const src = data && typeof data === "object" ? data : {};
  const roleInfo = Array.isArray(src.role_info) && src.role_info[0] ? src.role_info[0] : {};
  const employeeId = normalizeText(src.username);
  if (!employeeId) return null;

  const role = mapDjangoRoleToNode(roleInfo.key, roleInfo.name, !!src.is_superuser);
  const displayName = normalizeText(src.name) || employeeId;
  const email = src.email == null ? "" : normalizeText(src.email);
  const deptName = normalizeText(src.dept_info && src.dept_info.dept_name);

  return {
    employeeId,
    username: displayName,
    email,
    department: deptName,
    region: deptName,
    role: VALID_NODE_ROLES.has(role) ? role : "fse",
  };
}

function mergeIdentityWithLocalProfile(localUser, identity) {
  if (!identity || !identity.employeeId) return localUser || null;
  if (!localUser) return identity;
  return {
    ...localUser,
    username: identity.username || localUser.username,
    email: identity.email || localUser.email,
    department: identity.department || localUser.department,
    region: identity.region || localUser.region,
    role: identity.role || localUser.role,
  };
}

/**
 * 本地 HMAC token 仅用于烟测/开发。生产默认关闭。
 * - ALLOW_LOCAL_AUTH=1/true/yes → 开启
 * - ALLOW_LOCAL_AUTH=0/false/no → 关闭
 * - 未设置时：非 production 默认开启
 */
function isLocalAuthAllowed(env = process.env) {
  const raw = String(env.ALLOW_LOCAL_AUTH || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return String(env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

/**
 * 开发期可跳过远程 Django 鉴权（临时忽略远端 DB 连接池炸了等问题）。
 * - SKIP_REMOTE_AUTH=1/true/yes → 跳过
 * - 未设置时：默认不跳过
 */
function isRemoteAuthSkipped(env = process.env) {
  const raw = String(env.SKIP_REMOTE_AUTH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function createAuthCache(opts = {}) {
  const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : 5 * 60 * 1000;
  const negativeTtlMs = Number(opts.negativeTtlMs) > 0 ? Number(opts.negativeTtlMs) : 60 * 1000;
  const map = new Map();

  function get(key) {
    const hit = map.get(String(key || ""));
    if (!hit) return null;
    if (Date.now() > hit.expireAt) {
      map.delete(String(key || ""));
      return null;
    }
    return hit.value;
  }

  function has(key) {
    const k = String(key || "");
    const hit = map.get(k);
    if (!hit) return false;
    if (Date.now() > hit.expireAt) {
      map.delete(k);
      return false;
    }
    return true;
  }

  function set(key, value, ttl = ttlMs) {
    map.set(String(key || ""), { value, expireAt: Date.now() + ttl });
  }

  function setNegative(key) {
    set(key, null, negativeTtlMs);
  }

  function clear() {
    map.clear();
  }

  return { get, has, set, setNegative, clear, ttlMs, negativeTtlMs };
}

function isRemoteDbSaturationError(payload) {
  const msg = String(
    (payload && (payload.msg || payload.message || payload.detail)) || ""
  ).toLowerCase();
  return (
    msg.includes("too many clients already") ||
    msg.includes("connection to server") ||
    msg.includes("remaining connection slots") ||
    msg.includes("sorry, too many clients")
  );
}

function isManagerRole(role) {
  const r = String(role || "").toLowerCase();
  return (
    r === "manager" ||
    r === "rsmanager" ||
    r === "fieldservicemanager" ||
    r === "fieldservicedirector"
  );
}

function createAuthUpstreamError(code, status, message) {
  const err = new Error(message || code);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * 全局认证上游并发目标按 worker 数均分到每个进程。
 * 例：AUTH_UPSTREAM_MAX_CONCURRENCY=16 + 8 workers → 每 worker 2。
 * 单进程 / 关闭 cluster 时使用全部全局额度。
 */
function resolveAuthUpstreamWorkerLimit(env = process.env) {
  const globalMax = positiveInt(env.AUTH_UPSTREAM_MAX_CONCURRENCY, 16);
  const rawEnabled = String(env.NODE_CLUSTER_ENABLED || "").trim().toLowerCase();
  if (rawEnabled === "0" || rawEnabled === "false" || rawEnabled === "no") {
    return globalMax;
  }
  const useCluster =
    rawEnabled === "1" ||
    rawEnabled === "true" ||
    rawEnabled === "yes" ||
    String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  if (!useCluster) return globalMax;
  const workers = Math.min(16, positiveInt(env.NODE_CLUSTER_WORKERS, 8));
  return Math.max(1, Math.ceil(globalMax / workers));
}

function createInFlightMap() {
  const map = new Map();

  function run(key, factory) {
    const cacheKey = String(key || "");
    const existing = map.get(cacheKey);
    if (existing) return existing;
    const pending = Promise.resolve()
      .then(() => factory())
      .finally(() => {
        if (map.get(cacheKey) === pending) map.delete(cacheKey);
      });
    map.set(cacheKey, pending);
    return pending;
  }

  return {
    run,
    size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
  };
}

function createConcurrencyLimiter(opts = {}) {
  const maxConcurrent = Math.max(1, positiveInt(opts.maxConcurrent, 2));
  const maxQueue = Math.max(0, positiveInt(opts.maxQueue, 64));
  const queueWaitMs = Math.max(1, positiveInt(opts.queueWaitMs, 3000));
  let active = 0;
  const queue = [];

  function dequeue(entry) {
    const idx = queue.indexOf(entry);
    if (idx >= 0) queue.splice(idx, 1);
  }

  function pump() {
    while (active < maxConcurrent && queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      clearTimeout(next.timer);
      active += 1;
      next.resolve(runTracked);
    }
  }

  async function runTracked(fn) {
    try {
      return await fn();
    } finally {
      active = Math.max(0, active - 1);
      pump();
    }
  }

  async function run(fn) {
    if (active < maxConcurrent) {
      active += 1;
      return runTracked(fn);
    }
    if (queue.length >= maxQueue) {
      throw createAuthUpstreamError(
        "auth_upstream_queue_full",
        503,
        "auth_upstream_unavailable",
      );
    }
    const runner = await new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: null,
      };
      entry.timer = setTimeout(() => {
        dequeue(entry);
        reject(
          createAuthUpstreamError(
            "auth_upstream_queue_timeout",
            503,
            "auth_upstream_unavailable",
          ),
        );
      }, queueWaitMs);
      queue.push(entry);
    });
    return runner(fn);
  }

  return {
    run,
    getStats() {
      return { active, queued: queue.length, maxConcurrent, maxQueue, queueWaitMs };
    },
  };
}

/**
 * Django /api/system/user/user_info/ 拉取器：缓存 + 同 token 合并 + 上游并发限制。
 * 无效 token → 返回 null；上游不可用 → throw（503/504），且不写负缓存。
 * 可选 clusterCoordinator：跨 worker 全局合并/限流（IPC 不传明文 JWT）。
 */
function createDjangoUserInfoFetcher(options = {}) {
  const cache = options.cache;
  const tokenCacheKey = options.tokenCacheKey;
  const runWithTimeout = options.runWithTimeout;
  const getTimeoutMs = options.getTimeoutMs || (() => 30_000);
  const getUpstreamUrl = options.getUpstreamUrl;
  const limiter = options.limiter;
  const inFlight = options.inFlight;
  const clusterCoordinator = options.clusterCoordinator || null;
  const isCircuitOpen = options.isCircuitOpen || (() => false);
  const openCircuit = options.openCircuit || (() => {});
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logError = options.logError || (() => {});

  async function executeUpstream(rawToken, cacheKey) {
    if (!clusterCoordinator && isCircuitOpen()) {
      throw createAuthUpstreamError(
        "auth_upstream_circuit_open",
        503,
        "auth_upstream_unavailable",
      );
    }
    try {
      const { upstreamRes, payload } = await runWithTimeout(async (signal) => {
        const response = await fetchImpl(getUpstreamUrl(), {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `JWT ${rawToken}`,
          },
          signal,
        });
        const responsePayload = await response.json().catch(() => null);
        return { upstreamRes: response, payload: responsePayload };
      }, getTimeoutMs());

      if (isRemoteDbSaturationError(payload)) {
        openCircuit(60 * 1000);
        throw createAuthUpstreamError(
          "auth_upstream_db_saturated",
          503,
          "auth_upstream_unavailable",
        );
      }

      const status = Number(upstreamRes && upstreamRes.status) || 0;
      if (status === 401 || status === 403) {
        cache.setNegative(cacheKey);
        return null;
      }
      if (status >= 500) {
        openCircuit(30 * 1000);
        throw createAuthUpstreamError(
          "auth_upstream_5xx",
          503,
          "auth_upstream_unavailable",
        );
      }
      if (!upstreamRes.ok) {
        openCircuit(30 * 1000);
        throw createAuthUpstreamError(
          "auth_upstream_unavailable",
          503,
          "auth_upstream_unavailable",
        );
      }

      if (!payload || payload.code !== 2000 || !payload.data) {
        if (isRemoteDbSaturationError(payload)) {
          openCircuit(60 * 1000);
          throw createAuthUpstreamError(
            "auth_upstream_db_saturated",
            503,
            "auth_upstream_unavailable",
          );
        }
        cache.setNegative(cacheKey);
        return null;
      }

      cache.set(cacheKey, payload.data);
      return payload.data;
    } catch (err) {
      if (err && (err.code === "upstream_timeout" || err.status === 504)) {
        openCircuit(30 * 1000);
        throw err;
      }
      if (
        err &&
        (err.code === "auth_upstream_db_saturated" ||
          err.code === "auth_upstream_5xx" ||
          err.code === "auth_upstream_unavailable" ||
          err.code === "auth_upstream_circuit_open" ||
          err.code === "auth_upstream_queue_full" ||
          err.code === "auth_upstream_queue_timeout")
      ) {
        throw err;
      }
      logError("Django user_info lookup failed", err);
      openCircuit(30 * 1000);
      throw createAuthUpstreamError(
        "auth_upstream_unavailable",
        503,
        "auth_upstream_unavailable",
      );
    }
  }

  async function fetchOnce(rawToken, cacheKey) {
    return limiter.run(() => executeUpstream(rawToken, cacheKey));
  }

  async function fetchDjangoUserInfo(token) {
    const raw = String(token || "").trim();
    if (!raw) return null;

    const cacheKey = tokenCacheKey(raw);
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    if (clusterCoordinator) {
      const data = await clusterCoordinator.run(cacheKey, () => executeUpstream(raw, cacheKey));
      // waiters 不跑 executeUpstream，需把 primary 回传结果写入本 worker 缓存
      if (data == null) cache.setNegative(cacheKey);
      else cache.set(cacheKey, data);
      return data;
    }

    if (isCircuitOpen()) {
      throw createAuthUpstreamError(
        "auth_upstream_circuit_open",
        503,
        "auth_upstream_unavailable",
      );
    }

    return inFlight.run(cacheKey, () => fetchOnce(raw, cacheKey));
  }

  return { fetchDjangoUserInfo };
}

module.exports = {
  VALID_NODE_ROLES,
  mapDjangoRoleToNode,
  mapDjangoUserInfoToLocalUser,
  mergeIdentityWithLocalProfile,
  isLocalAuthAllowed,
  isRemoteAuthSkipped,
  createAuthCache,
  isRemoteDbSaturationError,
  isManagerRole,
  positiveInt,
  createAuthUpstreamError,
  resolveAuthUpstreamWorkerLimit,
  createInFlightMap,
  createConcurrencyLimiter,
  createDjangoUserInfoFetcher,
};
