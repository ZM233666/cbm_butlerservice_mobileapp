/**
 * 任务图片规范化命名：
 * {task_no}__{slot_id}__{employee_no}__{YYYYMMDDHHmmss}__{rand4}.{ext}
 */
function sanitizePart(raw, fallback = "na") {
  const text = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (text || fallback).slice(0, 64);
}

function normalizeExt(ext) {
  const raw = String(ext || "").trim().toLowerCase();
  if (!raw) return ".jpg";
  const withDot = raw.startsWith(".") ? raw : `.${raw}`;
  return /^\.\w{1,8}$/.test(withDot) ? withDot : ".jpg";
}

function timestampCompact(date = new Date()) {
  const d = date instanceof Date ? date : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function buildNormalizedTaskFilename({ taskId, slotId, employeeId, ext, now } = {}) {
  const task = sanitizePart(taskId, "notask");
  const slot = sanitizePart(slotId, "noslot");
  const employee = sanitizePart(employeeId, "noemp");
  const ts = timestampCompact(now instanceof Date ? now : new Date());
  const rand = Math.random().toString(36).slice(2, 6);
  return `${task}__${slot}__${employee}__${ts}__${rand}${normalizeExt(ext)}`;
}

function buildLegacyUploadFilename(ext) {
  const safeExt = normalizeExt(ext);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
}

module.exports = {
  sanitizePart,
  normalizeExt,
  timestampCompact,
  buildNormalizedTaskFilename,
  buildLegacyUploadFilename,
};
