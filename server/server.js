const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const cluster = require("node:cluster");
const express = require("express");
const multer = require("multer");
const exifr = require("exifr");
const { buildConfig } = require("./config");
const { info, error } = require("./lib/logger");
const { ensureDir, appendJsonLine, readJsonArray, readJsonObject, writeJsonObject } = require("./lib/fs-store");
const { createApiCache } = require("./lib/api-cache");
const { buildTaskSummary } = require("./services/task-summary");
const {
  isTaskDataFromDb,
  fetchHomeConfigFromDb,
  fetchTaskStatusFromDb,
  fetchTaskDetailFromDb,
  fetchTaskCentreFromDb,
  createTaskCentreTaskInDb,
  fetchRecordsFromDb,
  postTaskStatusToDb,
  fetchSubmitLatestFromDb,
  postTaskSubmitToDb,
  postReportGenerateToDb,
  postTaskDraftToDb,
  fetchManagerDashboardFromDb,
  postManagerAssignmentToDb,
  fetchWorkOrdersFromDb,
  fetchWorkOrderStatsFromDb,
  createWorkOrderInDb,
  postWorkOrderStatusToDb,
  postWorkOrderDispatchToDb,
} = require("./services/django-task");
const {
  normalizeAssignmentsStore,
  buildManagerDashboard,
} = require("./services/manager-dashboard");
const {
  normalizeUsersStore,
  upsertUser,
  normalizeWorkOrderStore,
  buildFseMembersFromUsers,
  createWorkOrder,
  updateWorkOrderStatus,
  dispatchWorkOrder,
  filterWorkOrders,
  buildWorkOrderStats,
  toTaskCard,
} = require("./services/work-order-center");
const {
  mapDjangoUserInfoToLocalUser,
  mergeIdentityWithLocalProfile,
  isLocalAuthAllowed,
  isRemoteAuthSkipped,
  createAuthCache,
  isRemoteDbSaturationError,
  isManagerRole,
} = require("./services/django-auth");
const {
  fetchH5ProfileFromDb,
  postH5CertificatesToDb,
  fetchUsersFromDb,
  isProfileDataFromDb,
} = require("./services/django-user");
const { buildNormalizedTaskFilename, buildLegacyUploadFilename } = require("./upload-filename");
const { validateTaskSubmitPayload, validateTaskDraftPayload } = require("./task-submit-payload");
const { validateUploadMetadata, validateStoredImage } = require("./image-upload-validation");
const { runWithTimeout, upstreamTimeoutMs } = require("./services/fetch-timeout");

const projectRoot = path.resolve(__dirname, "..");
const cfg = buildConfig(projectRoot);

ensureDir(cfg.uploadsDir);
ensureDir(cfg.certUploadsDir);
ensureDir(path.dirname(cfg.manifestPath));
ensureDir(path.dirname(cfg.taskEditRequestPath));
ensureDir(path.dirname(cfg.managerAssignmentsPath));
ensureDir(path.dirname(cfg.usersDataPath));
ensureDir(path.dirname(cfg.recommendationsPath));

const app = express();
ensureUsersSeeded();

function getLanIPv4Urls(port) {
  try {
    const interfaces = os.networkInterfaces();
    const urls = [];
    Object.values(interfaces).forEach((items) => {
      (items || []).forEach((addr) => {
        if (!addr || addr.internal || addr.family !== "IPv4") return;
        urls.push(`http://${addr.address}:${port}`);
      });
    });
    return urls;
  } catch {
    return [];
  }
}

function parseFiniteNumber(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeIsoTime(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function normalizeMaint(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "c1c3") return "c1c3";
  if (v === "c4c6" || v === "c4-c6") return "c4c6";
  return "";
}

function normalizeStatus(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "todo" || v === "doing" || v === "done" || v === "rejected") return v;
  return "";
}

function normalizeTaskKeyPart(raw) {
  // 用于 taskKey 的稳定化：去掉首尾空白，压缩中间空白，避免 key 里出现不可见字符
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getStatusFromEntry(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  const status = normalizeStatus(e.status);
  if (status === "rejected") return "rejected";
  if (status === "todo" && e.rejected) return "rejected";
  return status || "";
}

function taskCardKey(card) {
  const c = card && typeof card === "object" ? card : {};
  const taskId = normalizeTaskKeyPart(c.taskId);
  if (taskId) return taskId;
  const maint = normalizeMaint(c.maint) || normalizeTaskKeyPart(c.maint);
  return [
    maint,
    normalizeTaskKeyPart(c.title),
    normalizeTaskKeyPart(c.deadline),
  ].join("-");
}

function attachStatusesToTaskCards(tasks, statuses) {
  const rows = Array.isArray(tasks) ? tasks : [];
  const src = statuses && typeof statuses === "object" ? statuses : {};
  const maintCounts = {};
  rows.forEach((card) => {
    const maint = normalizeMaint(card && card.maint);
    if (maint) maintCounts[maint] = (maintCounts[maint] || 0) + 1;
  });

  return rows.map((card) => {
    const existing = normalizeStatus(card && card.status);
    if (existing) return { ...card, status: existing };

    const key = taskCardKey(card);
    const byKey = getStatusFromEntry(src[key]);
    if (byKey) return { ...card, status: byKey };

    const taskId = normalizeTaskKeyPart(card && card.taskId);
    const byTaskId = taskId && taskId !== key ? getStatusFromEntry(src[taskId]) : "";
    if (byTaskId) return { ...card, status: byTaskId };

    // 兼容旧数据：仅当同 maint 只有一条任务时，才允许回退到 maint 级别状态。
    const maint = normalizeMaint(card && card.maint);
    if (maint && (maintCounts[maint] || 0) <= 1) {
      const byMaint = getStatusFromEntry(src[maint]);
      if (byMaint) return { ...card, status: byMaint };
    }

    return { ...card, status: "todo" };
  });
}

function readUsersStore() {
  const raw = readJsonObject(cfg.usersDataPath);
  return normalizeUsersStore(raw);
}

function writeUsersStore(store) {
  const normalized = normalizeUsersStore(store);
  writeJsonObject(cfg.usersDataPath, normalized);
  return normalized;
}

function ensureUsersSeeded() {
  const store = readUsersStore();
  if (store.users.length > 0) return store;
  const seeded = {
    users: [
      {
        employeeId: "1",
        username: "Zhen Miao",
        email: "1@com",
        role: "fse",
        department: "",
        region: "Shanghai",
        specialWorkCertificates: [
          {
            name: "登高证",
            id: "20240108001",
            validUntil: "2028.01.01",
            status: "valid",
          },
        ],
        qualifications: [
          "工程师",
        ],
        skillLevel: "T3",
        skillTypes: [
          "EMU",
        ],
      },
      {
        employeeId: "2",
        username: "Zhen Miao",
        email: "2@com",
        role: "manager",
        department: "",
        region: "Suzhou",
      },
      {
        employeeId: "3",
        username: "Zhen Miao",
        email: "3@com",
        role: "fse",
        department: "",
        region: "Shanghai",
        specialWorkCertificates: [],
        qualifications: [
          "工程师",
        ],
        skillLevel: "T4",
        skillTypes: [
          "LOCO",
        ],
      },
    ],
  };
  return writeUsersStore(seeded);
}

const AUTH_TOKEN_SECRET = String(process.env.AUTH_TOKEN_SECRET || "butler-dev-secret");
const AUTH_TOKEN_EXPIRE_SEC = Number.parseInt(String(process.env.AUTH_TOKEN_EXPIRE_SEC || "43200"), 10);

function signTokenPayload(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_TOKEN_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function issueAuthToken(user) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expireSec = Number.isFinite(AUTH_TOKEN_EXPIRE_SEC) && AUTH_TOKEN_EXPIRE_SEC > 0 ? AUTH_TOKEN_EXPIRE_SEC : 43200;
  return signTokenPayload({
    employeeId: String(user && user.employeeId || "").trim(),
    role: String(user && user.role || "").trim().toLowerCase(),
    iat: nowSec,
    exp: nowSec + expireSec,
  });
}

function verifyAuthToken(token) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", AUTH_TOKEN_SECRET).update(payload).digest("hex");
  if (sig !== expectedSig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded || typeof decoded !== "object") return null;
    if (!decoded.exp || nowSec >= Number(decoded.exp)) return null;
    return {
      employeeId: String(decoded.employeeId || "").trim(),
      role: String(decoded.role || "").trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const raw = String(token || "").trim();
  if (!raw || !raw.includes(".")) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  const payload = String(parts[1] || "").trim();
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object") return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded.exp && Number.isFinite(Number(decoded.exp)) && nowSec >= Number(decoded.exp)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function pickFirstString(values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function resolveSkipModeJwtUser(req, token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const usersStore = readUsersStore();
  const hintedEmployeeId = pickFirstString([
    payload.employeeId,
    payload.employee_id,
    payload.employee_no,
    payload.employeeNo,
    payload.username,
    payload.user_name,
    payload.account,
    req.headers && (req.headers["x-employee-id"] || req.headers["X-Employee-Id"]),
    req.query && req.query.employeeId,
    req.body && req.body.employeeId,
  ]);

  if (hintedEmployeeId) {
    const byEmployeeId = usersStore.users.find((u) => u.employeeId === hintedEmployeeId);
    if (byEmployeeId) return byEmployeeId;
  }

  const hintedUsername = pickFirstString([payload.username, payload.user_name, payload.name, payload.nickname]);
  if (hintedUsername) {
    const byUsername = usersStore.users.find((u) => u.username === hintedUsername);
    if (byUsername) return byUsername;
  }

  return null;
}

function authFromRequest(req) {
  const h = String(req.headers.authorization || "").trim();
  if (!h) return null;
  const lower = h.toLowerCase();
  if (lower.startsWith("bearer ")) return h.slice(7).trim();
  if (lower.startsWith("jwt ")) return h.slice(4).trim();
  return null;
}

function readWorkOrderStore() {
  const raw = readJsonObject(cfg.managerAssignmentsPath);
  return normalizeWorkOrderStore(raw);
}

function writeWorkOrderStore(store) {
  const normalized = normalizeWorkOrderStore(store);
  writeJsonObject(cfg.managerAssignmentsPath, normalized);
  return normalized;
}

function syncTaskStatusByWorkOrder(assignment) {
  if (isTaskDataFromDb()) return;
  if (!assignment || !assignment.id) return;
  const allTaskStatus = readJsonObject(cfg.taskStatusPath);
  const assigneeId = String(assignment.assignedTo && assignment.assignedTo.employeeId || "").trim();
  if (!assigneeId) return;
  const userStatuses =
    allTaskStatus[assigneeId] && typeof allTaskStatus[assigneeId] === "object"
      ? allTaskStatus[assigneeId]
      : {};
  userStatuses[assignment.id] = {
    status: assignment.status || "todo",
    updatedAt: new Date().toISOString(),
    maint: assignment.maint,
    taskKey: assignment.id,
    taskId: assignment.id,
    source: "work_order",
  };
  allTaskStatus[assigneeId] = userStatuses;
  writeJsonObject(cfg.taskStatusPath, allTaskStatus);
}

function readRecommendationsStore() {
  const raw = readJsonObject(cfg.recommendationsPath);
  const src = raw && typeof raw === "object" ? raw : {};
  const rows = Array.isArray(src.rows) ? src.rows : [];
  const accepted = src.accepted && typeof src.accepted === "object" ? src.accepted : {};
  return { rows, accepted };
}

function writeRecommendationsStore(store) {
  const src = store && typeof store === "object" ? store : {};
  const rows = Array.isArray(src.rows) ? src.rows : [];
  const accepted = src.accepted && typeof src.accepted === "object" ? src.accepted : {};
  writeJsonObject(cfg.recommendationsPath, { rows, accepted });
  return { rows, accepted };
}

function normalizeRecoCard(row) {
  const r = row && typeof row === "object" ? row : {};
  const id = String(r.id || "").trim();
  if (!id) return null;
  const maint = normalizeMaint(r.maint);
  if (!maint) return null;
  const title = String(r.title || "").trim() || maint.toUpperCase();
  const depot = String(r.depot || "").trim();
  const deadline = String(r.deadline || "").trim();
  const workOrderId = String(r.workOrderId || r.taskId || "").trim();
  return {
    id,
    maint,
    title,
    depot,
    deadline,
    meta: "CBM AI",
    taskId: workOrderId || undefined,
    workOrderId: workOrderId || undefined,
  };
}

function safeReadJsonLines(absPath, maxLines) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const take = Number.isFinite(maxLines) && maxLines > 0 ? lines.slice(-maxLines) : lines;
    const out = [];
    take.forEach((line) => {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* ignore */
      }
    });
    return out;
  } catch {
    return [];
  }
}

function requiredUploadSlotsByMaint() {
  const taskData = readJsonObject(cfg.tasksDataPath);
  const rows = Array.isArray(taskData.rows) ? taskData.rows : [];
  const setC1 = new Set();
  const setC4 = new Set();
  rows.forEach((r) => {
    const scopeTags = Array.isArray(r && r.scopeTags) ? r.scopeTags : [];
    const buttons = Array.isArray(r && r.buttons) ? r.buttons : [];
    const slots = buttons.map((b) => String(b && b.slot || "").trim()).filter(Boolean);
    if (!slots.length) return;
    const hasAll = scopeTags.includes("all");
    const hasC1 = scopeTags.includes("c1c3");
    const hasC4 = scopeTags.includes("c4c6");
    slots.forEach((s) => {
      if (hasAll || hasC1) setC1.add(s);
      if (hasAll || hasC4) setC4.add(s);
    });
  });
  return { c1c3: setC1.size, c4c6: setC4.size };
}

async function requestJson(url, headers) {
  if (typeof fetch !== "function") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.geocodeTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: headers || {},
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocodeByAmap(latitude, longitude) {
  if (!cfg.amapWebApiKey) return null;
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", cfg.amapWebApiKey);
  url.searchParams.set("location", `${longitude},${latitude}`);
  url.searchParams.set("extensions", "base");
  url.searchParams.set("radius", "1000");
  url.searchParams.set("batch", "false");
  url.searchParams.set("roadlevel", "0");
  const json = await requestJson(url.toString());
  if (!json || String(json.status) !== "1" || !json.regeocode) return null;
  const rc = json.regeocode || {};
  const comp = rc.addressComponent || {};
  const cityRaw = Array.isArray(comp.city) ? comp.city[0] : comp.city;
  const city = cityRaw || comp.province || "";
  return {
    provider: "amap",
    address: String(rc.formatted_address || "").trim(),
    province: String(comp.province || "").trim(),
    city: String(city || "").trim(),
    district: String(comp.district || "").trim(),
  };
}

async function reverseGeocodeByNominatim(latitude, longitude) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");
  const json = await requestJson(url.toString(), {
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent": "ButlerService/1.0",
  });
  if (!json) return null;
  const addr = json.address || {};
  const city = addr.city || addr.town || addr.county || "";
  const district = addr.city_district || addr.suburb || addr.state_district || "";
  return {
    provider: "nominatim",
    address: String(json.display_name || "").trim(),
    province: String(addr.state || "").trim(),
    city: String(city || "").trim(),
    district: String(district || "").trim(),
  };
}

async function reverseGeocodeLocation(latitude, longitude) {
  if (!cfg.reverseGeocodeEnabled) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // 上传链路中优先保证响应速度：只有配置高德 key 时才执行逆地理编码。
  if (!cfg.amapWebApiKey) return null;
  const amap = await reverseGeocodeByAmap(latitude, longitude);
  if (amap && (amap.address || amap.city || amap.district)) return amap;
  return null;
}

async function extractPhotoCaptureMeta(absFilePath) {
  try {
    const exif = await exifr.parse(absFilePath, {
      gps: true,
      tiff: true,
      exif: true,
      xmp: false,
      iptc: false,
      icc: false,
      jfif: false,
    });
    if (!exif) return null;

    const latitude = typeof exif.latitude === "number" ? exif.latitude : null;
    const longitude = typeof exif.longitude === "number" ? exif.longitude : null;
    const capturedAt =
      exif.DateTimeOriginal ||
      exif.CreateDate ||
      exif.ModifyDate ||
      exif.DateTimeDigitized ||
      null;

    const capture = {};
    if (capturedAt instanceof Date && !Number.isNaN(capturedAt.getTime())) {
      capture.capturedAt = capturedAt.toISOString();
    }
    if (latitude != null && longitude != null) {
      capture.location = {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      };
    }
    return Object.keys(capture).length ? capture : null;
  } catch (_e) {
    return null;
  }
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.use(express.json({ limit: cfg.bodyLimit }));
app.use(express.urlencoded({ extended: true }));

const REMOTE_API_BASE = String(process.env.REMOTE_API_BASE || "http://117.62.232.51:8004").replace(/\/$/, "");
const REMOTE_PROXY_PREFIXES = String(process.env.REMOTE_PROXY_PREFIXES || "/captcha/,/login/,/system/,/token/")
  .split(",")
  .map((x) => String(x || "").trim())
  .filter(Boolean)
  .map((x) => (x.startsWith("/") ? x : `/${x}`))
  .map((x) => (x.endsWith("/") ? x : `${x}/`));
const ALLOW_LOCAL_AUTH = isLocalAuthAllowed();
const SKIP_REMOTE_AUTH = isRemoteAuthSkipped();
const AUTH_CACHE_TTL_MS = Number.parseInt(String(process.env.AUTH_CACHE_TTL_MS || "300000"), 10);
const djangoAuthCache = createAuthCache({
  ttlMs: Number.isFinite(AUTH_CACHE_TTL_MS) && AUTH_CACHE_TTL_MS > 0 ? AUTH_CACHE_TTL_MS : 300000,
  negativeTtlMs: 60 * 1000,
});
const djangoApiCache = createApiCache({ defaultTtlMs: cfg.apiCacheHomeConfigTtlMs, maxEntries: 800 });
let remoteAuthCircuitOpenUntil = 0;

function invalidateEmployeeTaskCache(employeeId) {
  const id = String(employeeId || "").trim();
  if (!id) return;
  djangoApiCache.delPrefix(`home-config:${id}`);
  djangoApiCache.delPrefix(`task-status:${id}`);
  djangoApiCache.delPrefix(`task-centre:${id}:`);
}

function invalidateManagerApiCache() {
  djangoApiCache.delPrefix("manager-dashboard:");
  djangoApiCache.delPrefix("work-orders:");
}

function shouldProxyToRemoteApi(apiPath) {
  return REMOTE_PROXY_PREFIXES.some((prefix) => apiPath === prefix || apiPath.startsWith(prefix));
}

function tokenCacheKey(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function fetchDjangoUserInfo(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (Date.now() < remoteAuthCircuitOpenUntil) return null;

  const cacheKey = tokenCacheKey(raw);
  const cached = djangoAuthCache.get(cacheKey);
  if (cached) return cached;

  const upstream = `${REMOTE_API_BASE}/api/system/user/user_info/`;
  try {
    const { upstreamRes, payload } = await runWithTimeout(async (signal) => {
      const response = await fetch(upstream, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `JWT ${raw}`,
        },
        signal,
      });
      const responsePayload = await response.json().catch(() => null);
      return { upstreamRes: response, payload: responsePayload };
    }, upstreamTimeoutMs("GET"));
    if (isRemoteDbSaturationError(payload)) {
      remoteAuthCircuitOpenUntil = Date.now() + 60 * 1000;
      error("Django auth circuit open: remote DB saturated");
      return null;
    }
    if (!upstreamRes.ok) return null;
    if (!payload || payload.code !== 2000 || !payload.data) return null;
    djangoAuthCache.set(cacheKey, payload.data);
    return payload.data;
  } catch (err) {
    error("Django user_info lookup failed", err);
    remoteAuthCircuitOpenUntil = Date.now() + 30 * 1000;
    if (err && err.code === "upstream_timeout") throw err;
    return null;
  }
}

function resolveLocalAuthUser(token) {
  if (!ALLOW_LOCAL_AUTH) return null;
  const localPayload = verifyAuthToken(token);
  if (!localPayload || !localPayload.employeeId || !localPayload.role) return null;
  const usersStore = readUsersStore();
  const user = usersStore.users.find((u) => u.employeeId === localPayload.employeeId);
  if (!user || user.role !== localPayload.role) return null;
  return user;
}

function resolveCachedDjangoIdentityUser(token) {
  const cacheKey = tokenCacheKey(token);
  const cachedInfo = djangoAuthCache.get(cacheKey);
  if (!cachedInfo) return null;
  const identity = mapDjangoUserInfoToLocalUser(cachedInfo);
  if (!identity) return null;
  const usersStore = readUsersStore();
  const existing = usersStore.users.find((u) => u.employeeId === identity.employeeId);
  return mergeIdentityWithLocalProfile(existing, identity);
}

async function resolveDjangoAuthUser(token) {
  const djangoInfo = await fetchDjangoUserInfo(token);
  const identity = mapDjangoUserInfoToLocalUser(djangoInfo);
  if (!identity) return null;

  if (isProfileDataFromDb()) {
    try {
      const profile = await fetchH5ProfileFromDb(identity.employeeId, token);
      if (profile && profile.employeeId) {
        const profileEmp = String(profile.employeeId).trim();
        const authEmp = identity.employeeId;
        if (profileEmp && profileEmp !== authEmp) {
          info("H5 profile employeeId mismatch; keeping user_info identity", {
            authEmp,
            profileEmp,
          });
        }
        return {
          employeeId: authEmp,
          username: String(profile.username || identity.username || authEmp).trim(),
          email: String(profile.email || "").trim(),
          department: String(profile.department || "").trim(),
          region: String(profile.region || "").trim(),
          role: String(profile.role || identity.role || "fse").trim().toLowerCase(),
          roleDisplayName: String(profile.roleDisplayName || "").trim() || undefined,
          specialWorkCertificates: Array.isArray(profile.specialWorkCertificates)
            ? profile.specialWorkCertificates
            : [],
          qualifications: Array.isArray(profile.qualifications) ? profile.qualifications : [],
          skillLevel: profile.skillLevel ? String(profile.skillLevel) : undefined,
          skillTypes: Array.isArray(profile.skillTypes) ? profile.skillTypes : [],
        };
      }
    } catch (err) {
      error("Django H5 profile lookup failed", err);
    }
  }

  const usersStore = readUsersStore();
  const existing = usersStore.users.find((u) => u.employeeId === identity.employeeId);
  if (!existing) {
    const upserted = upsertUser(usersStore, identity);
    if (upserted.error) return null;
    writeUsersStore(upserted.store);
    return upserted.user;
  }

  const merged = mergeIdentityWithLocalProfile(existing, identity);
  if (
    merged.username !== existing.username ||
    merged.email !== existing.email ||
    merged.department !== existing.department ||
    merged.region !== existing.region ||
    merged.role !== existing.role
  ) {
    const upserted = upsertUser(usersStore, merged);
    if (!upserted.error) writeUsersStore(upserted.store);
    return upserted.error ? merged : upserted.user;
  }
  return merged;
}

function resolveJwtIdentityFallback(req, token) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.user_id == null) return null;
  const employeeId = pickFirstString([
    payload.username,
    payload.user_name,
    req.headers && (req.headers["x-employee-id"] || req.headers["X-Employee-Id"]),
  ]);
  if (!employeeId) return null;
  const usersStore = readUsersStore();
  const existing = usersStore.users.find((u) => u.employeeId === employeeId);
  if (existing) return existing;
  return {
    employeeId,
    username: employeeId,
    email: "",
    department: "",
    region: "",
    role: "fse",
  };
}

function looksLikeDjangoJwt(token) {
  const payload = decodeJwtPayload(token);
  return !!(payload && payload.user_id != null);
}

async function resolveAuthUser(req) {
  const token = authFromRequest(req);
  if (!token) return null;

  // 开发期临时开关：完全跳过远程鉴权，只用本地 token/档案
  if (SKIP_REMOTE_AUTH) {
    return resolveLocalAuthUser(token) || resolveCachedDjangoIdentityUser(token) || resolveSkipModeJwtUser(req, token);
  }

  // 优先 Django JWT（带短缓存）；远端 DB 爆了时熔断并降级本地
  const djangoUser = await resolveDjangoAuthUser(token);
  if (djangoUser) return djangoUser;

  const cached = resolveCachedDjangoIdentityUser(token);
  if (cached) return cached;

  const jwtFallback = resolveJwtIdentityFallback(req, token);
  if (jwtFallback) return jwtFallback;

  // TASK_DATA_SOURCE=db 时禁止回退到本地 HMAC token（users.json 演示工号 1/2/3），
  // 否则会出现「登录 20005303、任务却是工号 1 的 8 条」的串号。
  if (isTaskDataFromDb()) return null;

  return resolveLocalAuthUser(token);
}

async function proxyToRemoteApi(req, res) {
  const upstream = new URL(`${REMOTE_API_BASE}${req.originalUrl}`);
  const headers = { ...req.headers, host: upstream.host, accept: req.headers.accept || "application/json" };
  delete headers.connection;
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body != null && typeof req.body === "object") {
      init.body = JSON.stringify(req.body);
      headers["content-type"] = headers["content-type"] || "application/json";
    }
  }
  try {
    const { upstreamRes, payload } = await runWithTimeout(async (signal) => {
      const response = await fetch(upstream, { ...init, signal });
      const responsePayload = Buffer.from(await response.arrayBuffer());
      return { upstreamRes: response, payload: responsePayload };
    }, upstreamTimeoutMs(req.method));
    res.status(upstreamRes.status);
    upstreamRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    res.send(payload);
  } catch (err) {
    error("Remote API proxy failed", err);
    const timedOut = err && err.code === "upstream_timeout";
    res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? "upstream_timeout" : "upstream_unavailable",
    });
  }
}

app.use("/api", (req, res, next) => {
  if (shouldProxyToRemoteApi(req.path)) {
    return proxyToRemoteApi(req, res);
  }
  next();
});

// /token/refresh/ 和 /token/* 直接转发到 Django（不在 /api 前缀下）
app.use("/token", (req, res) => proxyToRemoteApi(req, res));

app.use("/api", async (req, res, next) => {
  if (req.path === "/users/login") return next();
  try {
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    req.authUser = user;
    next();
  } catch (err) {
    error("Auth middleware failed", err);
    const timedOut = err && err.code === "upstream_timeout";
    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      error: timedOut ? "auth_upstream_timeout" : "auth_upstream_unavailable",
    });
  }
});

function createUpload(dir, { filenameBuilder } = {}) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      try {
        if (typeof filenameBuilder === "function") {
          return cb(null, filenameBuilder(req, file));
        }
        const ext = path.extname(file.originalname) || ".jpg";
        return cb(null, buildLegacyUploadFilename(ext));
      } catch (err) {
        return cb(err);
      }
    },
  });
  return multer({
    storage,
    limits: { fileSize: cfg.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      if (validateUploadMetadata(file)) return cb(null, true);
      const err = new Error("invalid_file_type");
      err.code = "invalid_file_type";
      return cb(err);
    },
  });
}

function rejectInvalidStoredImage(file, res) {
  if (validateStoredImage(file)) return false;
  if (file && file.path) fs.rmSync(file.path, { force: true });
  res.status(400).json({ ok: false, error: "invalid_file_type" });
  return true;
}

function buildTaskUploadFilename(req, file) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const ext = path.extname(file.originalname) || ".jpg";
  return buildNormalizedTaskFilename({
    taskId: body.taskId || body.mainTaskId,
    slotId: body.slotId,
    slotLabel: body.clientDisplayName || body.slotLabel,
    employeeId: body.employeeId,
    ext,
  });
}

/** multer 写盘时 req.body 可能尚未解析，上传完成后按表单字段重命名。 */
function finalizeTaskUploadFilename(req, file) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const taskId = String(body.taskId || body.mainTaskId || "").trim();
  const slotId = String(body.slotId || "").trim();
  const employeeId = String(body.employeeId || "").trim();
  if (!taskId && !slotId && !employeeId) return file.filename;

  const ext = path.extname(file.filename) || path.extname(file.originalname) || ".jpg";
  const desired = buildNormalizedTaskFilename({
    taskId,
    slotId,
    slotLabel: body.clientDisplayName || body.slotLabel,
    employeeId,
    ext,
  });
  if (desired === file.filename) return file.filename;

  const currentPath = file.path || path.join(cfg.uploadsDir, file.filename);
  let targetName = desired;
  let targetPath = path.join(cfg.uploadsDir, targetName);
  let attempt = 0;
  while (fs.existsSync(targetPath) && path.resolve(targetPath) !== path.resolve(currentPath)) {
    attempt += 1;
    const rand = Math.random().toString(36).slice(2, 6);
    targetName = desired.replace(/(\.[^.]+)$/, `_${rand}$1`);
    targetPath = path.join(cfg.uploadsDir, targetName);
    if (attempt >= 5) break;
  }
  if (path.resolve(targetPath) !== path.resolve(currentPath)) {
    fs.renameSync(currentPath, targetPath);
    file.path = targetPath;
  }
  return targetName;
}

function buildClientCapturePayload(body) {
  const fallbackClientCaptureAt = normalizeIsoTime(body && body.clientCapturedAt);
  const fallbackClientLatitude = parseFiniteNumber(body && body.clientLatitude);
  const fallbackClientLongitude = parseFiniteNumber(body && body.clientLongitude);
  const fallbackClientAccuracy = parseFiniteNumber(body && body.clientLocationAccuracy);
  const capture = {};
  if (fallbackClientCaptureAt) capture.capturedAt = fallbackClientCaptureAt;
  if (
    fallbackClientLatitude != null &&
    fallbackClientLongitude != null &&
    fallbackClientLatitude >= -90 &&
    fallbackClientLatitude <= 90 &&
    fallbackClientLongitude >= -180 &&
    fallbackClientLongitude <= 180
  ) {
    capture.location = {
      latitude: Number(fallbackClientLatitude.toFixed(6)),
      longitude: Number(fallbackClientLongitude.toFixed(6)),
    };
    if (fallbackClientAccuracy != null && fallbackClientAccuracy >= 0) {
      capture.location.accuracy = Number(fallbackClientAccuracy.toFixed(1));
    }
  }
  return Object.keys(capture).length ? capture : null;
}

function appendUploadManifest(record, callback) {
  appendJsonLine(cfg.manifestPath, record, callback || (() => {}));
}

const upload = createUpload(cfg.uploadsDir, { filenameBuilder: buildTaskUploadFilename });
const certificateUpload = createUpload(cfg.certUploadsDir);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ButlerService",
    env: cfg.env,
    now: new Date().toISOString(),
    clusterWorker: cluster.isWorker ? cluster.worker.id : null,
  });
});

app.get("/api/metrics", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    service: "ButlerService",
    pid: process.pid,
    clusterWorker: cluster.isWorker ? cluster.worker.id : null,
    uptimeSec: Math.round(process.uptime()),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
  });
});

app.get("/api/records", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const keyword = String(req.query.keyword || "");
  const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
  const employeeId = resolveTaskEmployeeId(req);
  if (!assertEmployeeAccess(req, res, employeeId)) return;
  if (!String(keyword || "").trim()) {
    return res.json({ ok: true, total: 0, rows: [] });
  }
  try {
    const token = authFromRequest(req);
    const data = await fetchRecordsFromDb(keyword, employeeId, limit, token);
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    return res.json({ ok: true, total: rows.length, rows });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django records search");
  }
});

app.get("/api/task-submit-latest", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const taskId = String(req.query.taskId || "").trim();
  if (!taskId) {
    return res.status(400).json({ ok: false, error: "task_id_required" });
  }
  try {
    const token = authFromRequest(req);
    const data = await fetchSubmitLatestFromDb(taskId, token);
    if (!data || !data.found) {
      return res.json({ ok: true, found: false });
    }
    return res.json({
      ok: true,
      found: true,
      submittedAt: data.submittedAt,
      uploads: data.uploads && typeof data.uploads === "object" ? data.uploads : {},
      issues: data.issues && typeof data.issues === "object" ? data.issues : {},
    });
  } catch (err) {
    const code = err && err.payload && err.payload.code;
    const msg = String((err && err.message) || "");
    if (code === 4030 || code === 4040 || msg === "forbidden" || msg === "task_not_found") {
      return res.json({ ok: true, found: false });
    }
    return respondTaskDbUpstreamError(res, err, "Django submit-latest");
  }
});

app.get("/api/task-summary", (_req, res) => {
  const taskData = readJsonObject(cfg.tasksDataPath);
  const rows = Array.isArray(taskData.rows) ? taskData.rows : [];
  const summary = buildTaskSummary(rows);
  res.json({ ok: true, ...summary });
});

function respondTaskDbRequired(res) {
  return res.status(503).json({
    ok: false,
    error: "task_data_source_db_required",
    detail: "Set TASK_DATA_SOURCE=db and ensure Django API is running.",
  });
}

function assertTaskDbConfigured(res) {
  if (isTaskDataFromDb()) return true;
  respondTaskDbRequired(res);
  return false;
}

function respondTaskDbUpstreamError(res, err, label) {
  error(`${label} failed`, err);
  const upstreamStatus = Number(err && err.status);
  const httpStatus = upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502;
  return res.status(httpStatus).json({
    ok: false,
    error: "task_db_upstream_unavailable",
    detail: String((err && err.message) || "upstream_error"),
  });
}

function resolveTaskEmployeeId(req) {
  const actor = req.authUser || {};
  const actorId = String(actor.employeeId || "").trim();
  const queryId = String(req.query.employeeId || "").trim();
  // 非经理只能查自己的任务，忽略前端 query 里可能过期的 employeeId
  if (!isManagerRole(actor.role)) return actorId;
  return queryId || actorId;
}

function assertEmployeeAccess(req, res, employeeId) {
  const id = String(employeeId || "").trim();
  if (!id) {
    res.status(400).json({ ok: false, error: "employee_id_required" });
    return false;
  }
  const actor = req.authUser || {};
  const isManager = isManagerRole(actor.role);
  if (!isManager && id !== String(actor.employeeId || "").trim()) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return false;
  }
  return true;
}

app.get("/api/home-config", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const employeeId = resolveTaskEmployeeId(req);
  if (!assertEmployeeAccess(req, res, employeeId)) return;
  try {
    const token = authFromRequest(req);
    const [dbConfig, statusData] = await Promise.all([
      djangoApiCache.getOrLoad(
        `home-config:${employeeId}`,
        () => fetchHomeConfigFromDb(employeeId, token),
        cfg.apiCacheHomeConfigTtlMs,
      ),
      djangoApiCache.getOrLoad(
        `task-status:${employeeId}`,
        () => fetchTaskStatusFromDb(employeeId, token),
        cfg.apiCacheTaskStatusTtlMs,
      ),
    ]);
    const recStore = readRecommendationsStore();
    const acceptedIds = Array.isArray(recStore.accepted[employeeId]) ? recStore.accepted[employeeId] : [];
    const acceptedSet = new Set(acceptedIds.map((x) => String(x || "").trim()).filter(Boolean));
    const recCards = recStore.rows
      .map(normalizeRecoCard)
      .filter(Boolean)
      .filter((c) => !acceptedSet.has(c.id))
      .map((c) => ({
        id: c.id,
        maint: c.maint,
        title: c.title,
        meta: "CBM AI",
        depot: c.depot || undefined,
        deadline: c.deadline || "",
        taskId: c.workOrderId || c.taskId,
        href: `/task-list?maint=${c.maint}`,
      }));
    return res.json({
      ok: true,
      tasks: attachStatusesToTaskCards(dbConfig.tasks || [], statusData && statusData.statuses),
      recommendations: recCards.length ? recCards : dbConfig.recommendations || [],
    });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django home-config");
  }
});

app.get("/api/task-status", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const employeeId = resolveTaskEmployeeId(req);
  if (!assertEmployeeAccess(req, res, employeeId)) return;
  try {
    const token = authFromRequest(req);
    const data = await djangoApiCache.getOrLoad(
      `task-status:${employeeId}`,
      () => fetchTaskStatusFromDb(employeeId, token),
      cfg.apiCacheTaskStatusTtlMs,
    );
    return res.json({ ok: true, employeeId: data.employeeId, statuses: data.statuses });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django task-status GET");
  }
});

app.get("/api/tasks/:taskId", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const taskId = String(req.params.taskId || "").trim();
  if (!taskId) {
    return res.status(400).json({ ok: false, error: "task_id_required" });
  }
  try {
    const token = authFromRequest(req);
    const task = await fetchTaskDetailFromDb(taskId, token);
    return res.json({ ok: true, task });
  } catch (err) {
    const code = err && err.payload && err.payload.code;
    const msg = String((err && err.message) || "");
    if (code === 4030 || msg === "forbidden") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (code === 4040 || msg === "task_not_found") {
      return res.status(404).json({ ok: false, error: "task_not_found" });
    }
    return respondTaskDbUpstreamError(res, err, "Django task-detail");
  }
});

app.get("/api/task-centre", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const employeeId = resolveTaskEmployeeId(req);
  if (!assertEmployeeAccess(req, res, employeeId)) return;
  const month = String(req.query.month || "").trim();
  try {
    const token = authFromRequest(req);
    const data = await djangoApiCache.getOrLoad(
      `task-centre:${employeeId}:${month || "current"}`,
      () => fetchTaskCentreFromDb(employeeId, month, token),
      cfg.apiCacheTaskCentreTtlMs,
    );
    return res.json({ ok: true, ...data });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django task-centre GET");
  }
});

app.post("/api/task-centre", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  if (!assertEmployeeAccess(req, res, employeeId)) return;
  try {
    const token = authFromRequest(req);
    const data = await createTaskCentreTaskInDb(req.body, token);
    invalidateEmployeeTaskCache(employeeId);
    return res.status(201).json({ ok: true, ...data });
  } catch (err) {
    const code = err && err.payload && err.payload.code;
    const msg = String((err && err.message) || "");
    if (code === 4000 || msg.includes("required") || msg.includes("invalid")) {
      return res.status(400).json({ ok: false, error: msg || "bad_request" });
    }
    return respondTaskDbUpstreamError(res, err, "Django task-centre POST");
  }
});

app.post("/api/task-status", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  const maint = normalizeMaint(req.body && req.body.maint);
  const status = normalizeStatus(req.body && req.body.status);
  const taskKey = String((req.body && req.body.taskKey) || "").trim();
  const mainTaskId = normalizeTaskKeyPart(req.body && req.body.taskId);
  const rejectedRaw = req.body && req.body.rejected;
  const rejected =
    rejectedRaw === true ||
    rejectedRaw === 1 ||
    String(rejectedRaw || "").trim().toLowerCase() === "true";
  const effectiveStatus = rejected && status === "todo" ? "rejected" : status;
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  const actor = req.authUser || {};
  const isManager = isManagerRole(actor.role);
  if (!isManager && employeeId !== String(actor.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (!maint) {
    return res.status(400).json({ ok: false, error: "maint_invalid" });
  }
  if (!status) {
    return res.status(400).json({ ok: false, error: "status_invalid" });
  }
  try {
    const token = authFromRequest(req);
    const data = await postTaskStatusToDb(req.body, token);
    invalidateEmployeeTaskCache(employeeId);
    const entry = data && data.status ? data.status : {};
    const key = String((data && data.taskKey) || taskKey || mainTaskId || "").trim();
    const user = { [key]: entry };
    return res.json({
      ok: true,
      employeeId,
      maint,
      taskKey: key,
      status: entry.status || effectiveStatus,
      statuses: user,
    });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django task-status POST");
  }
});

app.post("/api/task-edit-request", (req, res, next) => {
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  const maint = normalizeMaint(req.body && req.body.maint);
  const reason = String((req.body && req.body.reason) || "").trim();
  const taskId = String((req.body && req.body.taskId) || "").trim();

  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  if (employeeId !== String(req.authUser && req.authUser.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (!maint) {
    return res.status(400).json({ ok: false, error: "maint_invalid" });
  }
  if (!reason) {
    return res.status(400).json({ ok: false, error: "reason_required" });
  }
  if (reason.length > 2000) {
    return res.status(400).json({ ok: false, error: "reason_too_long" });
  }

  const requestId = `editreq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    type: "task_edit_request",
    requestId,
    at: new Date().toISOString(),
    employeeId,
    maint,
    taskId,
    reason,
  };

  appendJsonLine(cfg.taskEditRequestPath, payload, (err) => {
    if (err) return next(err);
    res.json({ ok: true, requestId });
  });
});

app.get("/api/users/self", async (req, res) => {
  const actor = req.authUser || {};
  const employeeId = String(actor.employeeId || "").trim();
  if (!employeeId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (isProfileDataFromDb()) {
    try {
      const token = authFromRequest(req);
      const profile = await djangoApiCache.getOrLoad(
        `user-profile:${employeeId}`,
        () => fetchH5ProfileFromDb(employeeId, token),
        cfg.apiCacheUserProfileTtlMs,
      );
      return res.json({ ok: true, user: profile });
    } catch (err) {
      if (actor && actor.employeeId) {
        error("Django user profile failed; falling back to auth user", err);
        return res.json({ ok: true, user: actor });
      }
      return respondTaskDbUpstreamError(res, err, "Django user profile");
    }
  }
  return res.json({ ok: true, user: actor });
});

app.get("/api/users", async (req, res) => {
  const actor = req.authUser || {};
  if (!isManagerRole(actor.role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (isProfileDataFromDb()) {
    try {
      const token = authFromRequest(req);
      const data = await fetchUsersFromDb(req.query, token);
      return res.json({
        ok: true,
        total: Number(data && data.total) || 0,
        users: Array.isArray(data && data.users) ? data.users : [],
      });
    } catch (err) {
      return respondTaskDbUpstreamError(res, err, "Django users list");
    }
  }
  const role = String(req.query.role || "").trim().toLowerCase();
  const employeeId = String(req.query.employeeId || "").trim();
  const store = readUsersStore();
  const rows = store.users.filter((u) => {
    if (employeeId && u.employeeId !== employeeId) return false;
    if (role && u.role !== role) return false;
    return true;
  });
  res.json({ ok: true, total: rows.length, users: rows });
});

app.post("/api/users", (req, res) => {
  const actor = req.authUser || {};
  if (!isManagerRole(actor.role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const current = readUsersStore();
  const upserted = upsertUser(current, req.body);
  if (upserted.error) {
    return res.status(400).json({ ok: false, error: upserted.error });
  }
  const saved = writeUsersStore(upserted.store);
  res.status(201).json({ ok: true, user: upserted.user, total: saved.users.length });
});

app.post("/api/users/self-certificates", async (req, res) => {
  const actor = req.authUser || {};
  const employeeId = String(actor.employeeId || "").trim();
  if (!employeeId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const specialWorkCertificates = Array.isArray(body.specialWorkCertificates)
    ? body.specialWorkCertificates
    : [];

  if (isProfileDataFromDb()) {
    try {
      const token = authFromRequest(req);
      const data = await postH5CertificatesToDb(
        { employeeId, specialWorkCertificates },
        token,
      );
      const user = data && data.user ? data.user : null;
      if (!user) {
        return res.status(502).json({ ok: false, error: "profile_update_failed" });
      }
      return res.json({ ok: true, user });
    } catch (err) {
      return respondTaskDbUpstreamError(res, err, "Django user certificates");
    }
  }

  const current = readUsersStore();
  const existing = current.users.find((x) => x.employeeId === employeeId);
  if (!existing) {
    return res.status(404).json({ ok: false, error: "user_not_found" });
  }
  const upserted = upsertUser(current, {
    ...existing,
    specialWorkCertificates,
  });
  if (upserted.error) {
    return res.status(400).json({ ok: false, error: upserted.error });
  }
  writeUsersStore(upserted.store);
  res.json({ ok: true, user: upserted.user });
});

app.post("/api/users/self-certificates/upload", certificateUpload.single("file"), (req, res) => {
  const actor = req.authUser || {};
  const employeeId = String(actor.employeeId || "").trim();
  if (!employeeId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "no_file" });
  }
  if (rejectInvalidStoredImage(req.file, res)) return;
  return res.json({
    ok: true,
    photoUrl: `/uploads/certificates/${req.file.filename}`,
    filename: req.file.filename,
  });
});

app.post("/api/users/login", (req, res) => {
  const input = req.body && typeof req.body === "object" ? req.body : {};
  const employeeId = String(input.employeeId || "").trim();
  const role = String(input.role || "").trim().toLowerCase();
  const username = String(input.username || "").trim();
  const email = String(input.email || "").trim();
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }

  const store = readUsersStore();
  const existing = store.users.find((x) => x.employeeId === employeeId);
  if (!existing) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }
  if (!role || role !== existing.role) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }
  if (!username || username !== existing.username) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }
  if (!email || email !== existing.email) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }
  return res.json({ ok: true, user: existing, token: issueAuthToken(existing), isNewUser: false });
});

app.get("/api/recommendations", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "fse") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const employeeId = String(req.query.employeeId || "").trim();
  if (employeeId !== String(actor.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const store = readRecommendationsStore();
  const acceptedIds = employeeId && Array.isArray(store.accepted[employeeId]) ? store.accepted[employeeId] : [];
  const acceptedSet = new Set((acceptedIds || []).map((x) => String(x || "").trim()).filter(Boolean));
  const rows = store.rows
    .map(normalizeRecoCard)
    .filter(Boolean)
    .filter((r) => !employeeId || !acceptedSet.has(r.id));
  res.json({ ok: true, total: rows.length, rows });
});

app.post("/api/recommendations/:id/accept", async (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "fse") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = String(req.params.id || "").trim();
  // 身份只信任登录态，忽略 body.employeeId（前端不可冒用他人）
  const employeeId = String(actor.employeeId || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "recommendation_id_required" });
  if (!employeeId) return res.status(401).json({ ok: false, error: "unauthorized" });

  const hintedEmployeeId = String(req.body && req.body.employeeId || "").trim();
  if (hintedEmployeeId && hintedEmployeeId !== employeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const store = readRecommendationsStore();
  const rec = store.rows.map(normalizeRecoCard).find((x) => x && x.id === id);
  if (!rec) return res.status(404).json({ ok: false, error: "recommendation_not_found" });

  const acceptedIds = Array.isArray(store.accepted[employeeId]) ? store.accepted[employeeId] : [];
  const targetWorkOrderId = String(rec.workOrderId || rec.taskId || "").trim();
  const token = authFromRequest(req);

  let existingWorkOrder = null;
  if (isTaskDataFromDb() && targetWorkOrderId) {
    try {
      const task = await fetchTaskDetailFromDb(targetWorkOrderId, token);
      if (task && task.taskId) {
        existingWorkOrder = {
          id: task.taskId,
          assignedTo: { employeeId: String(task.employeeId || "").trim() },
        };
      }
    } catch (_err) {
      existingWorkOrder = null;
    }
  } else {
    const workOrderStore = readWorkOrderStore();
    existingWorkOrder = targetWorkOrderId
      ? workOrderStore.assignments.find((x) => String(x.id || "").trim() === targetWorkOrderId)
      : null;
  }

  if (acceptedIds.includes(id)) {
    return res.json({
      ok: true,
      accepted: true,
      alreadyAccepted: true,
      recommendationId: id,
      workOrder: existingWorkOrder || undefined,
    });
  }

  if (existingWorkOrder && String(existingWorkOrder.assignedTo && existingWorkOrder.assignedTo.employeeId || "") !== employeeId) {
    return res.status(409).json({ ok: false, error: "recommendation_already_claimed" });
  }

  let workOrder = existingWorkOrder;
  if (!workOrder) {
    const payload = {
      id: targetWorkOrderId,
      source: "cbm_ai",
      assignedToEmployeeId: employeeId,
      maint: rec.maint,
      vehicleNo: "HXD1-1234",
      deadline: rec.deadline || new Date().toISOString().slice(0, 10),
      title: `${rec.title} Recommended Inspection`,
      depot: rec.depot || "",
      createdBy: { employeeId: "cbm_ai", name: "CBM AI" },
    };
    if (isTaskDataFromDb()) {
      try {
        const data = await createWorkOrderInDb(payload, token);
        workOrder = data && data.workOrder ? data.workOrder : null;
        if (!workOrder) {
          return res.status(502).json({ ok: false, error: "work_order_create_failed" });
        }
      } catch (err) {
        const msg = String((err && err.message) || "");
        if (msg === "task_no_exists") {
          workOrder = existingWorkOrder;
        } else {
          return respondTaskDbUpstreamError(res, err, "Django recommendation work-order");
        }
      }
    } else {
      const usersStore = readUsersStore();
      const created = createWorkOrder(payload, usersStore);
      if (created.error) {
        return res.status(400).json({ ok: false, error: created.error });
      }
      const workOrderStore = readWorkOrderStore();
      const nextWoStore = {
        ...workOrderStore,
        assignments: [created.assignment, ...workOrderStore.assignments],
        fseMembers: buildFseMembersFromUsers(usersStore),
      };
      writeWorkOrderStore(nextWoStore);
      syncTaskStatusByWorkOrder(created.assignment);
      workOrder = created.assignment;
    }
  }

  store.accepted[employeeId] = [...acceptedIds, id];
  writeRecommendationsStore(store);

  res.status(201).json({ ok: true, accepted: true, workOrder, recommendationId: id });
});

app.get("/api/work-orders", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  const isManager = isManagerRole(actor.role);
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assigneeIdRaw = String(req.query.assigneeId || "").trim();
  const assigneeId = isManager ? assigneeIdRaw : (assigneeIdRaw || actorEmployeeId);
  if (!isManager && assigneeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  try {
    const token = authFromRequest(req);
    const data = await fetchWorkOrdersFromDb(
      {
        status: req.query.status,
        assigneeId,
        month: req.query.month,
        maint: req.query.maint,
      },
      token
    );
    const rows = Array.isArray(data && data.rows) ? data.rows : [];
    return res.json({ ok: true, total: Number(data && data.total) || rows.length, rows });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django work-orders list");
  }
});

app.get("/api/work-orders/stats", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  const isManager = isManagerRole(actor.role);
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assigneeIdRaw = String(req.query.assigneeId || "").trim();
  const assigneeId = isManager ? assigneeIdRaw : (assigneeIdRaw || actorEmployeeId);
  if (!isManager && assigneeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  try {
    const token = authFromRequest(req);
    const stats = await fetchWorkOrderStatsFromDb(
      {
        month: req.query.month,
        assigneeId,
        maint: req.query.maint,
      },
      token
    );
    return res.json({ ok: true, ...(stats && typeof stats === "object" ? stats : {}) });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django work-orders stats");
  }
});

app.post("/api/work-orders", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  const isManager = isManagerRole(actor.role);
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assignedToEmployeeId = String(req.body && req.body.assignedToEmployeeId || "").trim();
  if (!isManager && assignedToEmployeeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const token = authFromRequest(req);
    const data = await createWorkOrderInDb(
      {
        ...body,
        createdBy: {
          employeeId: actorEmployeeId,
          name: String(actor.username || "").trim() || actorEmployeeId,
        },
      },
      token
    );
    const workOrder = data && data.workOrder ? data.workOrder : null;
    if (!workOrder) {
      return res.status(502).json({ ok: false, error: "work_order_create_failed" });
    }
    return res.status(201).json({ ok: true, workOrder });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django work-orders create");
  }
});

app.post("/api/work-orders/:id/dispatch", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  if (!isManagerRole(actor.role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "work_order_id_required" });
  }
  try {
    const token = authFromRequest(req);
    const data = await postWorkOrderDispatchToDb(id, req.body, token);
    const workOrder = data && data.workOrder ? data.workOrder : null;
    if (!workOrder) {
      return res.status(502).json({ ok: false, error: "work_order_dispatch_failed" });
    }
    return res.json({ ok: true, workOrder });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django work-orders dispatch");
  }
});

app.post("/api/work-orders/:id/status", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const id = String(req.params.id || "").trim();
  const status = String(req.body && req.body.status || "").trim().toLowerCase();
  if (!id) {
    return res.status(400).json({ ok: false, error: "work_order_id_required" });
  }
  const actor = req.authUser || {};
  const actorRole = String(actor.role || "").toLowerCase();
  const actorEmployeeId = String(actor.employeeId || "").trim();
  if (!isManagerRole(actorRole)) {
    try {
      const token = authFromRequest(req);
      const listed = await fetchWorkOrdersFromDb({ assigneeId: actorEmployeeId }, token);
      const rows = Array.isArray(listed && listed.rows) ? listed.rows : [];
      const target = rows.find((x) => String(x.id || "").trim() === id);
      if (!target) {
        return res.status(404).json({ ok: false, error: "work_order_not_found" });
      }
      if (String(target.assignedTo && target.assignedTo.employeeId || "") !== actorEmployeeId) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
    } catch (err) {
      return respondTaskDbUpstreamError(res, err, "Django work-orders status precheck");
    }
  }
  try {
    const token = authFromRequest(req);
    const data = await postWorkOrderStatusToDb(id, { status }, token);
    const workOrder = data && data.workOrder ? data.workOrder : null;
    if (!workOrder) {
      return res.status(502).json({ ok: false, error: "work_order_status_failed" });
    }
    return res.json({ ok: true, workOrder });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django work-orders status");
  }
});

app.get("/api/manager/dashboard", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  if (!isManagerRole(actor.role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const month = String(req.query.month || "").trim();
  try {
    const token = authFromRequest(req);
    const dashboard = await djangoApiCache.getOrLoad(
      `manager-dashboard:${String(actor.employeeId || "").trim()}:${month || "current"}`,
      () => fetchManagerDashboardFromDb(month, token),
      cfg.apiCacheManagerDashboardTtlMs,
    );
    return res.json({ ok: true, ...(dashboard && typeof dashboard === "object" ? dashboard : {}) });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django manager dashboard");
  }
});

app.post("/api/manager/assignments", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const actor = req.authUser || {};
  if (!isManagerRole(actor.role)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const token = authFromRequest(req);
    const data = await postManagerAssignmentToDb(
      {
        ...body,
        createdBy: {
          employeeId: String(actor.employeeId || "").trim(),
          name: String(actor.username || "").trim() || String(actor.employeeId || "").trim(),
        },
      },
      token
    );
    const assignment = data && data.assignment ? data.assignment : null;
    if (!assignment) {
      return res.status(502).json({ ok: false, error: "assignment_create_failed" });
    }
    invalidateManagerApiCache();
    return res.status(201).json({ ok: true, assignment });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django manager assignments");
  }
});

app.get("/RVSChinaDT_Logo.png", (_req, res) => {
  const logoCandidates = [
    path.join(projectRoot, "RVSChinaDT_Logo.png"),
    path.join(projectRoot, "frontend", "dist", "RVSChinaDT_Logo.png"),
    path.join(projectRoot, "frontend", "public", "RVSChinaDT_Logo.png"),
  ];
  const logoPath = logoCandidates.find((candidate) => fs.existsSync(candidate));
  if (!logoPath) {
    return res.status(404).json({ ok: false, error: "logo_not_found" });
  }
  res.sendFile(logoPath);
});

app.use("/PicSamples", express.static(cfg.picSamplesDir));
app.use("/uploads/task", express.static(cfg.uploadsDir));
// 兼容历史落盘目录（改指向 Django media 之前的 Node 本地 uploads）
if (cfg.legacyUploadsDir && cfg.legacyUploadsDir !== cfg.uploadsDir) {
  app.use("/uploads/task", express.static(cfg.legacyUploadsDir));
}
app.use("/uploads/certificates", express.static(cfg.certUploadsDir));
// 兼容 TaskList 子任务数据：即便启用 Vue dist，也始终从 public/data 提供静态 JSON
app.use("/data", express.static(path.join(cfg.publicDir, "data")));

app.post("/api/upload", upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "no_file" });
  }
  if (rejectInvalidStoredImage(req.file, res)) return;
  const slotId = (req.body && req.body.slotId) || "";
  const taskId = String((req.body && (req.body.taskId || req.body.mainTaskId)) || "").trim();
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  const clientDisplayName = String((req.body && req.body.clientDisplayName) || "").trim();
  let storedName = req.file.filename;
  try {
    storedName = finalizeTaskUploadFilename(req, req.file);
    req.file.filename = storedName;
  } catch (renameErr) {
    error("upload rename failed", renameErr);
  }
  const displayName = clientDisplayName || req.file.originalname || storedName;
  const uploadedAt = new Date().toISOString();
  const publicUrl = `/uploads/task/${storedName}`;
  const absFilePath = path.join(cfg.uploadsDir, storedName);
  const hasClientGeo = (() => {
    const lat = parseFiniteNumber(req.body && req.body.clientLatitude);
    const lng = parseFiniteNumber(req.body && req.body.clientLongitude);
    return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  })();
  const clientCapture = buildClientCapturePayload(req.body);
  const captureMeta =
    cfg.uploadSkipServerExifWhenClientGeo && hasClientGeo
      ? null
      : await extractPhotoCaptureMeta(absFilePath);
  const capture = { ...(clientCapture || {}), ...(captureMeta || {}) };
  const geocodeTarget =
    capture.location &&
    Number.isFinite(capture.location.latitude) &&
    Number.isFinite(capture.location.longitude)
      ? { latitude: capture.location.latitude, longitude: capture.location.longitude }
      : null;
  const record = {
    type: "upload",
    at: uploadedAt,
    slotId,
    taskId: taskId || undefined,
    employeeId: employeeId || undefined,
    url: publicUrl,
    storedName,
    originalname: req.file.originalname,
    displayName,
    mimetype: req.file.mimetype,
    size: req.file.size,
  };
  if (Object.keys(capture).length) {
    record.capture = capture;
  }
  appendUploadManifest(record, (err) => {
    if (err) return next(err);
    const payload = {
      ok: true,
      slotId,
      url: publicUrl,
      storedName,
      originalname: req.file.originalname,
      displayName,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt,
    };
    if (Object.keys(capture).length) {
      payload.capture = capture;
    }
    res.json(payload);
    if (
      geocodeTarget &&
      cfg.reverseGeocodeEnabled &&
      cfg.uploadGeocodeAsync &&
      cfg.amapWebApiKey
    ) {
      setImmediate(() => {
        reverseGeocodeLocation(geocodeTarget.latitude, geocodeTarget.longitude)
          .then((geocoded) => {
            if (!geocoded) return;
            appendJsonLine(cfg.manifestPath, {
              type: "upload_geocode",
              at: new Date().toISOString(),
              storedName,
              slotId,
              taskId: taskId || undefined,
              employeeId: employeeId || undefined,
              location: geocoded,
            }, (err) => {
              if (err) error("upload geocode manifest failed", err);
            });
          })
          .catch((err) => error("upload geocode async failed", err));
      });
    }
  });
});

app.post("/api/task-draft", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const validated = validateTaskDraftPayload(req.body || {});
  if (!validated.ok) {
    return res.status(400).json({ ok: false, error: validated.error });
  }
  const payload = validated.body;
  try {
    const token = authFromRequest(req);
    const data = await postTaskDraftToDb(payload, token, projectRoot);
    invalidateEmployeeTaskCache(
      String(
        payload.employeeId ||
          payload.employeeNo ||
          (payload.basicInfo && payload.basicInfo.employeeId) ||
          "",
      ).trim(),
    );
    return res.json({
      ok: true,
      status: data && data.status ? data.status : undefined,
      uploads: data && data.uploads ? data.uploads : undefined,
      issues: data && data.issues ? data.issues : undefined,
      updatedSeqCount: data && data.updatedSeqCount != null ? data.updatedSeqCount : undefined,
    });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django task-draft");
  }
});

app.post("/api/task-submit", async (req, res) => {
  if (!assertTaskDbConfigured(res)) return;
  const allowEmptyUploads = Boolean(req.body && req.body.allowEmptyUploads);
  const validated = validateTaskSubmitPayload(req.body || {}, {
    requireContent: !allowEmptyUploads,
  });
  if (!validated.ok) {
    return res.status(400).json({ ok: false, error: validated.error });
  }
  const payload = validated.body;
  try {
    const token = authFromRequest(req);
    const data = await postTaskSubmitToDb(payload, token, projectRoot);
    invalidateEmployeeTaskCache(
      String(
        payload.employeeId ||
          payload.employeeNo ||
          (payload.basicInfo && payload.basicInfo.employeeId) ||
          "",
      ).trim(),
    );

    let report = null;
    const markDone = payload.markDone !== false;
    const upstreamReport = data && data.report && typeof data.report === "object" ? data.report : null;
    // 优先使用 Django 提交接口内入队结果，避免二次调用失败导致漏触发
    if (upstreamReport) {
      const status = String(upstreamReport.status || "").trim() || (upstreamReport.ok === false ? "failed" : "queued");
      report = {
        ok: upstreamReport.ok !== false && status !== "failed",
        status,
        queue: String(upstreamReport.queue || "").trim() || undefined,
        celeryTaskId: String(upstreamReport.celeryTaskId || upstreamReport.task_id || "").trim() || undefined,
        error: upstreamReport.error ? String(upstreamReport.error) : undefined,
      };
    } else if (markDone) {
      const taskPk = data && data.id != null ? Number(data.id) : NaN;
      if (Number.isInteger(taskPk) && taskPk > 0) {
        try {
          const reportData = await postReportGenerateToDb(taskPk, token);
          report = {
            ok: true,
            status: String((reportData && reportData.status) || "queued").trim() || "queued",
            queue: String((reportData && reportData.queue) || "").trim() || undefined,
            celeryTaskId: String((reportData && reportData.task_id) || "").trim() || undefined,
          };
        } catch (reportErr) {
          error("Report generation enqueue failed after task submit", reportErr);
          report = {
            ok: false,
            status: "failed",
            error: String((reportErr && reportErr.message) || "report_enqueue_failed"),
          };
        }
      } else {
        error("Report generation skipped: missing task id after submit", { taskId: data && data.taskId });
        report = {
          ok: false,
          status: "failed",
          error: "report_task_id_required",
        };
      }
    }

    return res.json({
      ok: true,
      taskId: data && data.taskId ? data.taskId : undefined,
      id: data && data.id != null ? data.id : undefined,
      status: data && data.status ? data.status : undefined,
      uploads: data && data.uploads ? data.uploads : undefined,
      issues: data && data.issues ? data.issues : undefined,
      updatedSeqCount: data && data.updatedSeqCount != null ? data.updatedSeqCount : undefined,
      report,
    });
  } catch (err) {
    return respondTaskDbUpstreamError(res, err, "Django task-submit");
  }
});

const spaDistDir = path.join(projectRoot, "frontend", "dist");
const spaIndexFile = path.join(spaDistDir, "index.html");
if (fs.existsSync(spaIndexFile)) {
  info("Serving Vue SPA from frontend/dist (run `npm run build` in frontend/ to update)");
  app.use(express.static(spaDistDir, {
    // 避免把旧 hashed 资源缓存死；开发期更新 dist 后更容易刷到新包
    etag: true,
    maxAge: 0,
  }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    // 静态资源缺失必须 404，不能回退成 index.html（否则浏览器会报 MIME text/html）
    if (
      req.path.startsWith("/assets/") ||
      req.path.startsWith("/uploads/") ||
      req.path.startsWith("/PicSamples/") ||
      req.path.startsWith("/data/") ||
      /\.[a-zA-Z0-9]+$/.test(req.path)
    ) {
      return res.status(404).type("text/plain").send("Not Found");
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(spaIndexFile, (err) => next(err));
  });
} else {
  app.use(express.static(cfg.publicDir));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, error: "file_too_large" });
    }
    return res.status(400).json({ ok: false, error: err.code });
  }
  if (err && err.code === "invalid_file_type") {
    return res.status(400).json({ ok: false, error: "invalid_file_type" });
  }
  error("Unhandled server error", err);
  res.status(500).json({ ok: false, error: "internal_error" });
});

function createServer() {
  if (!cfg.httpsEnabled) {
    return { server: http.createServer(app), protocol: "http" };
  }
  if (!fs.existsSync(cfg.sslKeyPath) || !fs.existsSync(cfg.sslCertPath)) {
    throw new Error(
      `HTTPS enabled but certificate files not found:\n` +
        `SSL_KEY_PATH=${cfg.sslKeyPath}\n` +
        `SSL_CERT_PATH=${cfg.sslCertPath}`
    );
  }
  const key = fs.readFileSync(cfg.sslKeyPath);
  const cert = fs.readFileSync(cfg.sslCertPath);
  return { server: https.createServer({ key, cert }, app), protocol: "https" };
}

const { server, protocol } = createServer();
server.listen(cfg.port, cfg.host, () => {
  const workerTag = cluster.isWorker ? ` worker#${cluster.worker.id}` : "";
  info(`ButlerService listening on ${protocol}://127.0.0.1:${cfg.port}${workerTag}`);
  info(`Remote API base: ${REMOTE_API_BASE}`);
  info(`Local HMAC auth: ${ALLOW_LOCAL_AUTH ? "enabled" : "disabled"}`);
  info(`Skip remote auth: ${SKIP_REMOTE_AUTH ? "enabled" : "disabled"}`);
  info(`Task data source: ${isTaskDataFromDb() ? "db" : "json"}`);
  info(`Uploads dir: ${cfg.uploadsDir}`);
  info(`Auth cache TTL: ${djangoAuthCache.ttlMs}ms`);
  const lanUrls = getLanIPv4Urls(cfg.port);
  if (lanUrls.length) {
    info("LAN access URLs:");
    lanUrls.forEach((url) => info(`  ${url.replace("http://", `${protocol}://`)}`));
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    error(
      `[ButlerService] 端口 ${cfg.port} 已被占用。可改用: PORT=3101 npm start\n` +
        `或释放端口: lsof -i :${cfg.port}   然后 kill <PID>`
    );
    process.exit(1);
    return;
  }
  throw err;
});
