/**
 * task-submit / task-draft 请求体校验与规范化。
 */
const { enrichIssueSubmitEntry } = require("./issue-submit-format");
const { validateBasicInfoMileage } = require("./task-basic-fields");
const { normalizeEquipmentMap } = require("./services/equipment-fields");

function pickTaskId(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const basic = body.basicInfo && typeof body.basicInfo === "object" ? body.basicInfo : {};
  return String(basic.taskId || basic.mainTaskId || body.taskId || "").trim();
}

function normalizeUploadEntry(meta) {
  if (!meta || typeof meta !== "object") return null;
  const url = String(meta.url || "").trim();
  if (!url) return null;
  const row = { url };
  if (meta.capture && typeof meta.capture === "object") {
    row.capture = meta.capture;
  }
  const displayName = String(meta.displayName || "").trim();
  if (displayName) row.displayName = displayName;
  return row;
}

function normalizeUploadsMap(uploads) {
  const src = uploads && typeof uploads === "object" ? uploads : {};
  const out = {};
  Object.entries(src).forEach(([slot, meta]) => {
    const key = String(slot || "").trim();
    if (!key) return;
    const row = normalizeUploadEntry(meta);
    if (row) out[key] = row;
  });
  return out;
}

const ABNORMAL_SEVERITIES = new Set(["severe", "moderate", "minor", "undetectable"]);

function normalizeAbnormalSeverity(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return ABNORMAL_SEVERITIES.has(s) ? s : "";
}

function normalizeIssueEntry(meta) {
  if (!meta || typeof meta !== "object") return null;
  const enriched = enrichIssueSubmitEntry(meta);
  let status = String(enriched.status || "").trim().toLowerCase();
  if (status === "normal") status = "ok";
  // enrich 已将历史 undetectable 顶层状态迁移为 abnormal
  const text = String(enriched.text || "").trim();
  const severity = normalizeAbnormalSeverity(enriched.severity);
  if (
    status !== "ok"
    && status !== "abnormal"
    && status !== "no_equipment"
    && !text
  ) {
    return null;
  }
  const row = {};
  if (
    status === "ok"
    || status === "abnormal"
    || status === "no_equipment"
  ) {
    row.status = status;
  }
  if (text) row.text = text;
  if (status === "abnormal" && severity) row.severity = severity;
  const result = String(enriched.result || "").trim();
  if (result) row.result = result;
  if (enriched.updatedAt) row.updatedAt = String(enriched.updatedAt);
  return Object.keys(row).length ? row : null;
}

function normalizeIssuesMap(issues) {
  const src = issues && typeof issues === "object" ? issues : {};
  const out = {};
  Object.entries(src).forEach(([rowId, meta]) => {
    const key = String(rowId || "").trim();
    if (!key) return;
    const row = normalizeIssueEntry(meta);
    if (row) out[key] = row;
  });
  return out;
}

function countValidUploads(uploads) {
  return Object.keys(normalizeUploadsMap(uploads)).length;
}

function countValidIssues(issues) {
  return Object.keys(normalizeIssuesMap(issues)).length;
}

function validateTaskWorkPayload(payload, { requireContent = false, requireMileage = true } = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const taskId = pickTaskId(body);
  if (!taskId) {
    return { ok: false, error: "task_id_required" };
  }
  const mileageCheck = validateBasicInfoMileage(body.basicInfo, { required: requireMileage });
  if (!mileageCheck.ok) {
    return { ok: false, error: mileageCheck.error };
  }
  const uploads = normalizeUploadsMap(body.uploads);
  const issues = normalizeIssuesMap(body.issues);
  const equipment = normalizeEquipmentMap(body.equipment);
  const abnormalitySummary =
    body.abnormalitySummary && typeof body.abnormalitySummary === "object"
      ? body.abnormalitySummary
      : body.abnormality_summary && typeof body.abnormality_summary === "object"
        ? body.abnormality_summary
        : undefined;
  const hasContent =
    Object.keys(uploads).length > 0
    || Object.keys(issues).length > 0
    || Object.keys(equipment).length > 0;
  if (requireContent && !hasContent && !body.allowEmptyUploads) {
    return { ok: false, error: "submit_payload_required" };
  }
  const basicInfo = {
    ...(body.basicInfo && typeof body.basicInfo === "object" ? body.basicInfo : {}),
    taskId,
  };
  if (mileageCheck.mileageKm != null) {
    basicInfo.mileageKm = mileageCheck.mileageKm;
  }
  return {
    ok: true,
    taskId,
    uploads,
    issues,
    equipment,
    abnormalitySummary,
    body: {
      ...body,
      uploads,
      issues,
      equipment,
      basicInfo,
      ...(abnormalitySummary ? { abnormalitySummary } : {}),
    },
  };
}

function validateTaskSubmitPayload(payload, options = {}) {
  const requireContent =
    options.requireContent != null
      ? Boolean(options.requireContent)
      : options.requireUploads !== false;
  return validateTaskWorkPayload(payload, { requireContent });
}

function validateTaskDraftPayload(payload) {
  return validateTaskWorkPayload(payload, { requireContent: false, requireMileage: false });
}

module.exports = {
  pickTaskId,
  normalizeUploadEntry,
  normalizeUploadsMap,
  normalizeAbnormalSeverity,
  normalizeIssueEntry,
  normalizeIssuesMap,
  normalizeEquipmentMap,
  countValidUploads,
  countValidIssues,
  validateTaskWorkPayload,
  validateTaskSubmitPayload,
  validateTaskDraftPayload,
};
