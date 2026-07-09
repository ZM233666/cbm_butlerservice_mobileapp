/**
 * task-submit / task-draft 请求体校验与规范化。
 */
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

function normalizeIssueEntry(meta) {
  if (!meta || typeof meta !== "object") return null;
  const text = String(meta.text || "").trim();
  if (!text) return null;
  const row = { text };
  if (meta.updatedAt) row.updatedAt = String(meta.updatedAt);
  return row;
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

function validateTaskWorkPayload(payload, { requireContent = false } = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const taskId = pickTaskId(body);
  if (!taskId) {
    return { ok: false, error: "task_id_required" };
  }
  const uploads = normalizeUploadsMap(body.uploads);
  const issues = normalizeIssuesMap(body.issues);
  const hasContent = Object.keys(uploads).length > 0 || Object.keys(issues).length > 0;
  if (requireContent && !hasContent && !body.allowEmptyUploads) {
    return { ok: false, error: "submit_payload_required" };
  }
  return {
    ok: true,
    taskId,
    uploads,
    issues,
    body: {
      ...body,
      uploads,
      issues,
      basicInfo: {
        ...(body.basicInfo && typeof body.basicInfo === "object" ? body.basicInfo : {}),
        taskId,
      },
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
  return validateTaskWorkPayload(payload, { requireContent: false });
}

module.exports = {
  pickTaskId,
  normalizeUploadEntry,
  normalizeUploadsMap,
  normalizeIssueEntry,
  normalizeIssuesMap,
  countValidUploads,
  countValidIssues,
  validateTaskWorkPayload,
  validateTaskSubmitPayload,
  validateTaskDraftPayload,
};
