const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const exifr = require("exifr");
const { buildConfig } = require("./config");
const { info, error } = require("./lib/logger");
const { ensureDir, appendJsonLine, readJsonArray, readJsonObject, writeJsonObject } = require("./lib/fs-store");
const { queryRecords } = require("./services/records-service");
const { buildTaskSummary } = require("./services/task-summary");
const { buildHomeConfig } = require("./services/home-config");
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

dotenv.config();

const projectRoot = path.resolve(__dirname, "..");
const cfg = buildConfig(projectRoot);

ensureDir(cfg.uploadsDir);
ensureDir(cfg.certUploadsDir);
ensureDir(path.dirname(cfg.manifestPath));
ensureDir(path.dirname(cfg.recordsDataPath));
ensureDir(path.dirname(cfg.homeConfigPath));
ensureDir(path.dirname(cfg.taskStatusPath));
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
  if (v === "todo" || v === "doing" || v === "done") return v;
  return "";
}

function normalizeTaskKeyPart(raw) {
  // 用于 taskKey 的稳定化：去掉首尾空白，压缩中间空白，避免 key 里出现不可见字符
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
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

function authFromRequest(req) {
  const h = String(req.headers.authorization || "").trim();
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
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

function buildUploadProgress(taskId, maint) {
  const id = String(taskId || "").trim();
  const m = normalizeMaint(maint);
  if (!id || !m) return null;

  const requiredMap = requiredUploadSlotsByMaint();
  const required = requiredMap[m] || 0;
  if (!required) return { uploaded: 0, required: 0, percent: 0 };

  const events = safeReadJsonLines(cfg.manifestPath, 800);
  let lastSubmit = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || e.type !== "submit") continue;
    const p = e.payload || {};
    const basic = p.basicInfo || {};
    const tid = String(basic.taskId || basic.mainTaskId || "").trim();
    if (tid && tid === id) {
      lastSubmit = p;
      break;
    }
  }
  const uploads = lastSubmit && lastSubmit.uploads && typeof lastSubmit.uploads === "object" ? lastSubmit.uploads : {};
  const uploaded = Object.values(uploads).filter((v) => v && typeof v === "object" && v.url).length;
  const percent = required > 0 ? Math.round((uploaded / required) * 100) : 0;
  return { uploaded, required, percent };
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
  const amap = await reverseGeocodeByAmap(latitude, longitude);
  if (amap && (amap.address || amap.city || amap.district)) return amap;
  const nominatim = await reverseGeocodeByNominatim(latitude, longitude);
  if (nominatim && (nominatim.address || nominatim.city || nominatim.district)) return nominatim;
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

app.use("/api", (req, res, next) => {
  if (req.path === "/users/login") return next();
  const token = authFromRequest(req);
  const tokenPayload = verifyAuthToken(token);
  if (!tokenPayload || !tokenPayload.employeeId || !tokenPayload.role) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const usersStore = readUsersStore();
  const user = usersStore.users.find((u) => u.employeeId === tokenPayload.employeeId);
  if (!user || user.role !== tokenPayload.role) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  req.authUser = user;
  next();
});

function createUpload(dir) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      cb(null, `${base}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: cfg.maxUploadBytes },
  });
}

const upload = createUpload(cfg.uploadsDir);
const certificateUpload = createUpload(cfg.certUploadsDir);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ButlerService",
    env: cfg.env,
    now: new Date().toISOString(),
  });
});

app.get("/api/records", (req, res) => {
  const keyword = String(req.query.keyword || "");
  const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
  const allRows = readJsonArray(cfg.recordsDataPath);
  const rows = queryRecords(allRows, keyword, limit);

  res.json({
    ok: true,
    total: rows.length,
    rows,
  });
});

app.get("/api/task-summary", (_req, res) => {
  const taskData = readJsonObject(cfg.tasksDataPath);
  const rows = Array.isArray(taskData.rows) ? taskData.rows : [];
  const summary = buildTaskSummary(rows);
  res.json({ ok: true, ...summary });
});

app.get("/api/home-config", (req, res) => {
  const raw = readJsonObject(cfg.homeConfigPath);
  const config = buildHomeConfig(raw);
  const employeeId = String(req.query.employeeId || "").trim();
  if (employeeId) {
    const actor = req.authUser || {};
    const isManager = String(actor.role || "").toLowerCase() === "manager";
    if (!isManager && employeeId !== String(actor.employeeId || "").trim()) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const workOrderStore = readWorkOrderStore();
    const assignedCards = filterWorkOrders(workOrderStore, { assigneeId: employeeId })
      .map((a) => {
        const c = toTaskCard(a);
        if (!c) return null;
        const taskId = String(c.taskId || "").trim();
        if (taskId) {
          const progress = buildUploadProgress(taskId, c.maint);
          if (progress) c.uploadProgress = progress;
        }
        return c;
      })
      .filter(Boolean);

    // 合并策略：优先使用工单库生成的 task card（含 meta / uploadProgress），覆盖 home-config 中同 taskId 项
    const existing = Array.isArray(config.tasks) ? config.tasks : [];
    const existingById = new Map();
    existing.forEach((c) => {
      const id = String(c && c.taskId || "").trim();
      if (!id) return;
      existingById.set(id, c);
    });

    const merged = [];
    const added = new Set();
    assignedCards.forEach((c) => {
      const id = String(c && c.taskId || "").trim();
      if (!id || added.has(id)) return;
      added.add(id);
      merged.push(c);
    });
    existing.forEach((c) => {
      const id = String(c && c.taskId || "").trim();
      if (id && added.has(id)) return; // 被工单库覆盖
      merged.push(c);
    });
    if (merged.length) config.tasks = merged;

    // 从推荐数据库读取该用户未接受的推荐（用于 CBM Recommendations）
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
    if (recCards.length) {
      config.recommendations = recCards;
    } else {
      config.recommendations = [];
    }
  }
  res.json({ ok: true, ...config });
});

app.get("/api/task-status", (req, res) => {
  const employeeId = String(req.query.employeeId || "").trim();
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  const actor = req.authUser || {};
  const isManager = String(actor.role || "").toLowerCase() === "manager";
  if (!isManager && employeeId !== String(actor.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const all = readJsonObject(cfg.taskStatusPath);
  const statuses = all[employeeId] && typeof all[employeeId] === "object" ? all[employeeId] : {};
  res.json({ ok: true, employeeId, statuses });
});

app.post("/api/task-status", (req, res) => {
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  const maint = normalizeMaint(req.body && req.body.maint);
  const status = normalizeStatus(req.body && req.body.status);
  const taskKey = String((req.body && req.body.taskKey) || "").trim();
  const mainTaskId = normalizeTaskKeyPart(req.body && req.body.taskId);
  const title = normalizeTaskKeyPart(req.body && req.body.title);
  const deadline = normalizeTaskKeyPart(req.body && req.body.deadline);
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  const actor = req.authUser || {};
  const isManager = String(actor.role || "").toLowerCase() === "manager";
  if (!isManager && employeeId !== String(actor.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (!maint) {
    return res.status(400).json({ ok: false, error: "maint_invalid" });
  }
  if (!status) {
    return res.status(400).json({ ok: false, error: "status_invalid" });
  }
  const all = readJsonObject(cfg.taskStatusPath);
  const user = all[employeeId] && typeof all[employeeId] === "object" ? all[employeeId] : {};
  // 任务唯一状态 key：优先使用每条任务独立的 Main Task ID
  const derivedKey = title && deadline ? `${maint}-${title}-${deadline}` : "";
  const key = taskKey || mainTaskId || derivedKey || maint;
  user[key] = {
    status,
    updatedAt: new Date().toISOString(),
    maint,
    taskKey: key,
    taskId: mainTaskId || undefined,
  };
  all[employeeId] = user;
  writeJsonObject(cfg.taskStatusPath, all);

  let syncedWorkOrder = null;
  if (mainTaskId || key) {
    const targetId = mainTaskId || key;
    const workOrderStore = readWorkOrderStore();
    const found = workOrderStore.assignments.find((x) => x.id === targetId);
    if (found) {
      const updated = updateWorkOrderStatus(workOrderStore, targetId, status);
      if (!updated.error) {
        writeWorkOrderStore(updated.store);
        syncedWorkOrder = updated.assignment;
      }
    }
  }

  res.json({
    ok: true,
    employeeId,
    maint,
    taskKey: key,
    status,
    statuses: user,
    syncedWorkOrderId: syncedWorkOrder && syncedWorkOrder.id ? syncedWorkOrder.id : undefined,
  });
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

app.get("/api/users", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "manager") {
    return res.status(403).json({ ok: false, error: "forbidden" });
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
  if (String(actor.role || "").toLowerCase() !== "manager") {
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

app.post("/api/users/self-certificates", (req, res) => {
  const actor = req.authUser || {};
  const employeeId = String(actor.employeeId || "").trim();
  if (!employeeId) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const specialWorkCertificates = Array.isArray(body.specialWorkCertificates)
    ? body.specialWorkCertificates
    : [];
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

app.post("/api/recommendations/:id/accept", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "fse") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = String(req.params.id || "").trim();
  const employeeId = String(req.body && req.body.employeeId || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "recommendation_id_required" });
  if (!employeeId) return res.status(400).json({ ok: false, error: "employee_id_required" });
  if (employeeId !== String(actor.employeeId || "").trim()) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }

  const store = readRecommendationsStore();
  const rec = store.rows.map(normalizeRecoCard).find((x) => x && x.id === id);
  if (!rec) return res.status(404).json({ ok: false, error: "recommendation_not_found" });

  const acceptedIds = Array.isArray(store.accepted[employeeId]) ? store.accepted[employeeId] : [];
  const usersStore = readUsersStore();
  const workOrderStore = readWorkOrderStore();
  const targetWorkOrderId = String(rec.workOrderId || rec.taskId || "").trim();
  const existingWorkOrder = targetWorkOrderId
    ? workOrderStore.assignments.find((x) => String(x.id || "").trim() === targetWorkOrderId)
    : null;

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
    const created = createWorkOrder(
      {
        id: targetWorkOrderId,
        source: "cbm_ai",
        assignedToEmployeeId: employeeId,
        maint: rec.maint,
        vehicleNo: "HXD1-1234",
        deadline: rec.deadline || new Date().toISOString().slice(0, 10),
        title: `${rec.title} Recommended Inspection`,
        depot: rec.depot || "",
        createdBy: { employeeId: "cbm_ai", name: "CBM AI" },
      },
      usersStore
    );
    if (created.error) {
      return res.status(400).json({ ok: false, error: created.error });
    }

    const nextWoStore = {
      ...workOrderStore,
      assignments: [created.assignment, ...workOrderStore.assignments],
      fseMembers: buildFseMembersFromUsers(usersStore),
    };
    writeWorkOrderStore(nextWoStore);
    syncTaskStatusByWorkOrder(created.assignment);
    workOrder = created.assignment;
  }

  store.accepted[employeeId] = [...acceptedIds, id];
  writeRecommendationsStore(store);

  res.status(201).json({ ok: true, accepted: true, workOrder, recommendationId: id });
});

app.get("/api/work-orders", (req, res) => {
  const actor = req.authUser || {};
  const isManager = String(actor.role || "").toLowerCase() === "manager";
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assigneeIdRaw = String(req.query.assigneeId || "").trim();
  const assigneeId = isManager ? assigneeIdRaw : (assigneeIdRaw || actorEmployeeId);
  if (!isManager && assigneeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const store = readWorkOrderStore();
  const rows = filterWorkOrders(store, {
    status: req.query.status,
    assigneeId,
    month: req.query.month,
    maint: req.query.maint,
  });
  res.json({ ok: true, total: rows.length, rows });
});

app.get("/api/work-orders/stats", (req, res) => {
  const actor = req.authUser || {};
  const isManager = String(actor.role || "").toLowerCase() === "manager";
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assigneeIdRaw = String(req.query.assigneeId || "").trim();
  const assigneeId = isManager ? assigneeIdRaw : (assigneeIdRaw || actorEmployeeId);
  if (!isManager && assigneeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const store = readWorkOrderStore();
  const stats = buildWorkOrderStats(store, {
    month: req.query.month,
    assigneeId,
    maint: req.query.maint,
  });
  res.json({ ok: true, ...stats });
});

app.post("/api/work-orders", (req, res) => {
  const actor = req.authUser || {};
  const isManager = String(actor.role || "").toLowerCase() === "manager";
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const assignedToEmployeeId = String(req.body && req.body.assignedToEmployeeId || "").trim();
  if (!isManager && assignedToEmployeeId !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const usersStore = readUsersStore();
  const workOrderStore = readWorkOrderStore();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const created = createWorkOrder(
    {
      ...body,
      createdBy: {
        employeeId: actorEmployeeId,
        name: String(actor.username || "").trim() || actorEmployeeId,
      },
    },
    usersStore
  );
  if (created.error) {
    return res.status(400).json({ ok: false, error: created.error });
  }
  const next = {
    ...workOrderStore,
    assignments: [created.assignment, ...workOrderStore.assignments],
    fseMembers: buildFseMembersFromUsers(usersStore),
  };
  writeWorkOrderStore(next);
  syncTaskStatusByWorkOrder(created.assignment);
  res.status(201).json({ ok: true, workOrder: created.assignment });
});

app.post("/api/work-orders/:id/dispatch", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "manager") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: "work_order_id_required" });
  }
  const workOrderStore = readWorkOrderStore();
  const usersStore = readUsersStore();
  const result = dispatchWorkOrder(
    workOrderStore,
    usersStore,
    id,
    req.body && req.body.assignedToEmployeeId,
    req.body
  );
  if (result.error) {
    const statusCode = result.error === "work_order_not_found" ? 404 : 400;
    return res.status(statusCode).json({ ok: false, error: result.error });
  }
  writeWorkOrderStore(result.store);
  syncTaskStatusByWorkOrder(result.assignment);
  res.json({ ok: true, workOrder: result.assignment });
});

app.post("/api/work-orders/:id/status", (req, res) => {
  const id = String(req.params.id || "").trim();
  const status = String(req.body && req.body.status || "").trim().toLowerCase();
  if (!id) {
    return res.status(400).json({ ok: false, error: "work_order_id_required" });
  }
  const workOrderStore = readWorkOrderStore();
  const actor = req.authUser || {};
  const actorRole = String(actor.role || "").toLowerCase();
  const actorEmployeeId = String(actor.employeeId || "").trim();
  const target = workOrderStore.assignments.find((x) => String(x.id || "").trim() === id);
  if (!target) {
    return res.status(404).json({ ok: false, error: "work_order_not_found" });
  }
  if (actorRole !== "manager" && String(target.assignedTo && target.assignedTo.employeeId || "") !== actorEmployeeId) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const result = updateWorkOrderStatus(workOrderStore, id, status);
  if (result.error) {
    const statusCode = result.error === "work_order_not_found" ? 404 : 400;
    return res.status(statusCode).json({ ok: false, error: result.error });
  }
  writeWorkOrderStore(result.store);
  syncTaskStatusByWorkOrder(result.assignment);
  res.json({ ok: true, workOrder: result.assignment });
});

app.get("/api/manager/dashboard", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "manager") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const month = String(req.query.month || "").trim();
  const storeRaw = readJsonObject(cfg.managerAssignmentsPath);
  const usersStore = readUsersStore();
  const store = normalizeAssignmentsStore(storeRaw);
  const fromUsers = buildFseMembersFromUsers(usersStore);
  if (fromUsers.length) {
    store.fseMembers = fromUsers;
  }
  const records = readJsonArray(cfg.recordsDataPath);
  const dashboard = buildManagerDashboard({
    store,
    records,
    month,
    actorEmployeeId: String(actor.employeeId || "").trim(),
  });
  res.json({ ok: true, ...dashboard });
});

app.post("/api/manager/assignments", (req, res) => {
  const actor = req.authUser || {};
  if (String(actor.role || "").toLowerCase() !== "manager") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const usersStore = readUsersStore();
  const workOrderStore = readWorkOrderStore();
  const created = createWorkOrder(
    {
      ...body,
      createdBy: {
        employeeId: String(actor.employeeId || "").trim(),
        name: String(actor.username || "").trim() || String(actor.employeeId || "").trim(),
      },
    },
    usersStore
  );
  if (created.error) {
    return res.status(400).json({ ok: false, error: created.error });
  }
  const next = {
    ...workOrderStore,
    assignments: [created.assignment, ...workOrderStore.assignments],
    fseMembers: buildFseMembersFromUsers(usersStore),
  };
  writeWorkOrderStore(next);
  syncTaskStatusByWorkOrder(created.assignment);
  res.status(201).json({ ok: true, assignment: created.assignment });
});

app.get("/RVSChinaDT_Logo.png", (_req, res) => {
  res.sendFile(path.join(projectRoot, "RVSChinaDT_Logo.png"));
});

app.use("/PicSamples", express.static(cfg.picSamplesDir));
app.use("/uploads/task", express.static(cfg.uploadsDir));
app.use("/uploads/certificates", express.static(cfg.certUploadsDir));
// 兼容 TaskList 子任务数据：即便启用 Vue dist，也始终从 public/data 提供静态 JSON
app.use("/data", express.static(path.join(cfg.publicDir, "data")));

app.post("/api/upload", upload.single("file"), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "no_file" });
  }
  const slotId = (req.body && req.body.slotId) || "";
  const clientDisplayName = String((req.body && req.body.clientDisplayName) || "").trim();
  const displayName = clientDisplayName || req.file.originalname || req.file.filename;
  const uploadedAt = new Date().toISOString();
  const publicUrl = `/uploads/task/${req.file.filename}`;
  const absFilePath = path.join(cfg.uploadsDir, req.file.filename);
  const captureMeta = await extractPhotoCaptureMeta(absFilePath);
  const fallbackClientCaptureAt = normalizeIsoTime(req.body && req.body.clientCapturedAt);
  const fallbackClientLatitude = parseFiniteNumber(req.body && req.body.clientLatitude);
  const fallbackClientLongitude = parseFiniteNumber(req.body && req.body.clientLongitude);
  const fallbackClientAccuracy = parseFiniteNumber(req.body && req.body.clientLocationAccuracy);
  const capture = captureMeta || {};
  if (!capture.capturedAt && fallbackClientCaptureAt) {
    capture.capturedAt = fallbackClientCaptureAt;
  }
  if (
    !capture.location &&
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
  if (capture.location) {
    const geocoded = await reverseGeocodeLocation(capture.location.latitude, capture.location.longitude);
    if (geocoded) {
      if (geocoded.address) capture.location.address = geocoded.address;
      if (geocoded.province) capture.location.province = geocoded.province;
      if (geocoded.city) capture.location.city = geocoded.city;
      if (geocoded.district) capture.location.district = geocoded.district;
      capture.location.provider = geocoded.provider;
    }
  }
  const record = {
    type: "upload",
    at: uploadedAt,
    slotId,
    url: publicUrl,
    storedName: req.file.filename,
    originalname: req.file.originalname,
    displayName,
    mimetype: req.file.mimetype,
    size: req.file.size,
  };
  if (Object.keys(capture).length) {
    record.capture = capture;
  }
  appendJsonLine(cfg.manifestPath, record, (err) => {
    if (err) return next(err);
    const payload = {
      ok: true,
      slotId,
      url: publicUrl,
      storedName: req.file.filename,
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
  });
});

app.post("/api/task-submit", (req, res, next) => {
  const payload = req.body || {};
  appendJsonLine(
    cfg.manifestPath,
    {
      type: "submit",
      at: new Date().toISOString(),
      payload,
    },
    (err) => {
      if (err) return next(err);
      res.json({ ok: true });
    }
  );
});

const spaDistDir = path.join(projectRoot, "frontend", "dist");
const spaIndexFile = path.join(spaDistDir, "index.html");
if (fs.existsSync(spaIndexFile)) {
  info("Serving Vue SPA from frontend/dist (run `npm run build` in frontend/ to update)");
  app.use(express.static(spaDistDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
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
  info(`ButlerService listening on ${protocol}://127.0.0.1:${cfg.port}`);
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
