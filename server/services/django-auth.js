const VALID_NODE_ROLES = new Set(["fse", "manager"]);

function normalizeText(v) {
  return String(v || "").trim();
}

function mapDjangoRoleToNode(roleKey, roleName, isSuperuser) {
  const key = normalizeText(roleKey).toLowerCase();
  const name = normalizeText(roleName).toLowerCase();

  if (key === "fse" || name === "fieldserviceengineer") return "fse";
  if (
    key === "rsm" ||
    key === "rsmanager" ||
    key === "fsm" ||
    key === "fieldservicemanager" ||
    key === "fsd" ||
    key === "fieldservicedirector" ||
    key === "admin" ||
    key === "superadmin" ||
    name === "regionalservicemanager" ||
    name === "fieldservicemanager" ||
    name === "fieldservicedirector" ||
    name === "管理员" ||
    name === "超级管理员" ||
    isSuperuser
  ) {
    return "manager";
  }
  if (key === "ext" || name === "externalcontractor") return "fse";
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

  function set(key, value, ttl = ttlMs) {
    map.set(String(key || ""), { value, expireAt: Date.now() + ttl });
  }

  function setNegative(key) {
    set(key, null, negativeTtlMs);
  }

  function clear() {
    map.clear();
  }

  return { get, set, setNegative, clear, ttlMs, negativeTtlMs };
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
};
