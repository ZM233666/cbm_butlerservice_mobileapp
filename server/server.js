const path = require("path");
const os = require("os");
const fs = require("fs");
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
  createAssignment,
} = require("./services/manager-dashboard");

dotenv.config();

const projectRoot = path.resolve(__dirname, "..");
const cfg = buildConfig(projectRoot);

ensureDir(cfg.uploadsDir);
ensureDir(path.dirname(cfg.manifestPath));
ensureDir(path.dirname(cfg.recordsDataPath));
ensureDir(path.dirname(cfg.homeConfigPath));
ensureDir(path.dirname(cfg.taskStatusPath));
ensureDir(path.dirname(cfg.managerAssignmentsPath));

const app = express();

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cfg.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: cfg.maxUploadBytes },
});

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

app.get("/api/home-config", (_req, res) => {
  const raw = readJsonObject(cfg.homeConfigPath);
  const config = buildHomeConfig(raw);
  res.json({ ok: true, ...config });
});

app.get("/api/task-status", (req, res) => {
  const employeeId = String(req.query.employeeId || "").trim();
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  const all = readJsonObject(cfg.taskStatusPath);
  const statuses = all[employeeId] && typeof all[employeeId] === "object" ? all[employeeId] : {};
  res.json({ ok: true, employeeId, statuses });
});

app.post("/api/task-status", (req, res) => {
  const employeeId = String((req.body && req.body.employeeId) || "").trim();
  const maint = normalizeMaint(req.body && req.body.maint);
  const status = normalizeStatus(req.body && req.body.status);
  if (!employeeId) {
    return res.status(400).json({ ok: false, error: "employee_id_required" });
  }
  if (!maint) {
    return res.status(400).json({ ok: false, error: "maint_invalid" });
  }
  if (!status) {
    return res.status(400).json({ ok: false, error: "status_invalid" });
  }
  const all = readJsonObject(cfg.taskStatusPath);
  const user = all[employeeId] && typeof all[employeeId] === "object" ? all[employeeId] : {};
  user[maint] = { status, updatedAt: new Date().toISOString() };
  all[employeeId] = user;
  writeJsonObject(cfg.taskStatusPath, all);
  res.json({ ok: true, employeeId, maint, status, statuses: user });
});

app.get("/api/manager/dashboard", (req, res) => {
  const month = String(req.query.month || "").trim();
  const storeRaw = readJsonObject(cfg.managerAssignmentsPath);
  const store = normalizeAssignmentsStore(storeRaw);
  const records = readJsonArray(cfg.recordsDataPath);
  const dashboard = buildManagerDashboard({ store, records, month });
  res.json({ ok: true, ...dashboard });
});

app.post("/api/manager/assignments", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const storeRaw = readJsonObject(cfg.managerAssignmentsPath);
  const store = normalizeAssignmentsStore(storeRaw);
  const created = createAssignment(body, store.fseMembers);
  if (created.error) {
    return res.status(400).json({ ok: false, error: created.error });
  }
  store.assignments.unshift(created.assignment);
  writeJsonObject(cfg.managerAssignmentsPath, store);

  // 指派后同步到被指派 FSE 的修程状态，保证 FSE 视角可见任务待办。
  const allTaskStatus = readJsonObject(cfg.taskStatusPath);
  const assigneeId = created.assignment.assignedTo.employeeId;
  const assigneeStatus =
    allTaskStatus[assigneeId] && typeof allTaskStatus[assigneeId] === "object"
      ? allTaskStatus[assigneeId]
      : {};
  assigneeStatus[created.assignment.maint] = {
    status: "todo",
    updatedAt: new Date().toISOString(),
    source: "manager_assignment",
  };
  allTaskStatus[assigneeId] = assigneeStatus;
  writeJsonObject(cfg.taskStatusPath, allTaskStatus);

  res.status(201).json({ ok: true, assignment: created.assignment });
});

app.get("/RVSChinaDT_Logo.png", (_req, res) => {
  res.sendFile(path.join(projectRoot, "RVSChinaDT_Logo.png"));
});

app.use("/PicSamples", express.static(cfg.picSamplesDir));
app.use("/uploads/task", express.static(cfg.uploadsDir));
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
