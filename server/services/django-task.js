/**
 * 从 Django butler-service 读取任务数据（TASK_DATA_SOURCE=db）。
 */
const fs = require("fs");
const path = require("path");
const { runWithTimeout, upstreamTimeoutMs } = require("./fetch-timeout");

function remoteApiBase() {
  return String(process.env.REMOTE_API_BASE || "http://117.62.232.51:8004").replace(/\/$/, "");
}

let _slotSeqCache = null;

function authHeaders(token) {
  const headers = { accept: "application/json" };
  const raw = String(token || "").trim();
  if (raw) headers.Authorization = raw.toLowerCase().startsWith("jwt ") ? raw : `JWT ${raw}`;
  return headers;
}

function upstreamErrorMessage(payload, res) {
  if (!payload) return `upstream_${res.status}`;
  const raw = payload.msg ?? payload.message;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    const detail = raw.detail ?? raw.message;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }
  return `upstream_code_${payload.code ?? res.status}`;
}

function upstreamHttpStatus(res, payload) {
  if (!res.ok) return res.status;
  const code = Number(payload && payload.code);
  if (code === 401 || code === 4010) return 401;
  if (code === 403 || code === 4030) return 403;
  if (code === 404 || code === 4040) return 404;
  return 502;
}

async function fetchDjangoJson(pathUrl, { token, method = "GET", body } = {}) {
  const upstream = `${remoteApiBase()}${pathUrl}`;
  const init = {
    method,
    headers: {
      ...authHeaders(token),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
  };
  if (body) init.body = JSON.stringify(body);
  const { res, payload } = await runWithTimeout(async (signal) => {
    const response = await fetch(upstream, { ...init, signal });
    const responsePayload = await response.json().catch(() => null);
    return { res: response, payload: responsePayload };
  }, upstreamTimeoutMs(method));
  if (!res.ok || !payload || payload.code !== 2000) {
    const err = new Error(upstreamErrorMessage(payload, res));
    err.status = upstreamHttpStatus(res, payload);
    err.payload = payload;
    throw err;
  }
  return payload.data;
}

function buildSlotSeqMap(projectRoot) {
  if (_slotSeqCache) return _slotSeqCache;
  const guidancePath = path.join(projectRoot, "public", "data", "brake-guidance-tasks.json");
  const map = {};
  try {
    const raw = JSON.parse(fs.readFileSync(guidancePath, "utf8"));
    const rows = Array.isArray(raw && raw.rows) ? raw.rows : [];
    rows.forEach((row) => {
      const seq = String((row && row.seq) || "").trim();
      if (!seq) return;
      const buttons = Array.isArray(row.buttons) ? row.buttons : [];
      buttons.forEach((btn) => {
        const slot = String((btn && btn.slot) || "").trim();
        if (slot) map[slot] = seq;
      });
    });
  } catch (_e) {
    /* ignore */
  }
  _slotSeqCache = map;
  return map;
}

async function fetchHomeConfigFromDb(employeeId, token) {
  const id = String(employeeId || "").trim();
  if (!id) return { tasks: [], recommendations: [] };
  const data = await fetchDjangoJson(`/api/business/task/h5/home-config/?employee_no=${encodeURIComponent(id)}`, {
    token,
  });
  return {
    tasks: Array.isArray(data && data.tasks) ? data.tasks : [],
    recommendations: Array.isArray(data && data.recommendations) ? data.recommendations : [],
  };
}

async function fetchTaskStatusFromDb(employeeId, token) {
  const id = String(employeeId || "").trim();
  if (!id) return { employeeId: id, statuses: {} };
  const data = await fetchDjangoJson(`/api/business/task/h5/task-status/?employee_no=${encodeURIComponent(id)}`, {
    token,
  });
  return {
    employeeId: String((data && data.employeeId) || id),
    statuses: data && typeof data.statuses === "object" && data.statuses ? data.statuses : {},
  };
}

async function postTaskStatusToDb(body, token) {
  return fetchDjangoJson("/api/business/task/h5/task-status/", {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

async function fetchTaskDetailFromDb(taskId, token) {
  const id = String(taskId || "").trim();
  if (!id) {
    const err = new Error("task_id_required");
    err.status = 400;
    throw err;
  }
  return fetchDjangoJson(`/api/business/task/h5/tasks/${encodeURIComponent(id)}/`, { token });
}

async function fetchTaskCentreFromDb(employeeId, month, token) {
  const id = String(employeeId || "").trim();
  if (!id) {
    const err = new Error("employee_id_required");
    err.status = 400;
    throw err;
  }
  const monthQ = String(month || "").trim();
  const qs = new URLSearchParams({ employee_no: id });
  if (monthQ) qs.set("month", monthQ);
  return fetchDjangoJson(`/api/business/task/h5/task-centre/?${qs.toString()}`, { token });
}

async function createTaskCentreTaskInDb(body, token) {
  return fetchDjangoJson("/api/business/task/h5/task-centre/", {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

async function fetchRecordsFromDb(keyword, employeeId, limit, token) {
  const id = String(employeeId || "").trim();
  const q = String(keyword || "").trim();
  const qs = new URLSearchParams({ employee_no: id, keyword: q });
  if (limit) qs.set("limit", String(limit));
  return fetchDjangoJson(`/api/business/task/h5/records/?${qs.toString()}`, { token });
}

async function fetchSubmitLatestFromDb(taskId, token) {
  const id = String(taskId || "").trim();
  if (!id) return { found: false };
  return fetchDjangoJson(`/api/business/task/h5/submit-latest/?task_no=${encodeURIComponent(id)}`, { token });
}

async function postTaskSubmitToDb(body, token, projectRoot) {
  const payload = body && typeof body === "object" ? { ...body } : {};
  payload.slotSeqMap = buildSlotSeqMap(projectRoot);
  return fetchDjangoJson("/api/business/task/h5/submit/", {
    token,
    method: "POST",
    body: payload,
  });
}

/** 任务提交成功后触发报告生成（异步队列，不阻塞主流程）。 */
async function postReportGenerateToDb(taskPk, token, options = {}) {
  const id = Number(taskPk);
  if (!Number.isInteger(id) || id < 1) {
    const err = new Error("report_task_id_required");
    err.status = 400;
    throw err;
  }
  const opts = options && typeof options === "object" ? options : {};
  return fetchDjangoJson("/api/report/generate/", {
    token,
    method: "POST",
    body: {
      task_id: id,
      template_code: String(opts.template_code || "report_template").trim() || "report_template",
      options: {
        trigger_workflow: opts.trigger_workflow !== false,
        emit_pdf: opts.emit_pdf !== false,
      },
    },
  });
}

async function postTaskDraftToDb(body, token, projectRoot) {
  const payload = body && typeof body === "object" ? { ...body } : {};
  payload.slotSeqMap = buildSlotSeqMap(projectRoot);
  return fetchDjangoJson("/api/business/task/h5/draft/", {
    token,
    method: "POST",
    body: payload,
  });
}

async function fetchManagerDashboardFromDb(month, token) {
  const monthQ = String(month || "").trim();
  const qs = monthQ ? `?month=${encodeURIComponent(monthQ)}` : "";
  return fetchDjangoJson(`/api/business/task/h5/manager/dashboard/${qs}`, { token });
}

async function postManagerAssignmentToDb(body, token) {
  return fetchDjangoJson("/api/business/task/h5/manager/assignments/", {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

function workOrderQueryString(query) {
  const q = query && typeof query === "object" ? query : {};
  const qs = new URLSearchParams();
  ["status", "assigneeId", "month", "maint"].forEach((key) => {
    const val = String(q[key] || "").trim();
    if (val) qs.set(key, val);
  });
  const text = qs.toString();
  return text ? `?${text}` : "";
}

async function fetchWorkOrdersFromDb(query, token) {
  return fetchDjangoJson(`/api/business/task/h5/work-orders/${workOrderQueryString(query)}`, { token });
}

async function fetchWorkOrderStatsFromDb(query, token) {
  return fetchDjangoJson(`/api/business/task/h5/work-orders/stats/${workOrderQueryString(query)}`, { token });
}

async function createWorkOrderInDb(body, token) {
  return fetchDjangoJson("/api/business/task/h5/work-orders/", {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

async function postWorkOrderStatusToDb(taskNo, body, token) {
  const id = String(taskNo || "").trim();
  if (!id) {
    const err = new Error("work_order_id_required");
    err.status = 400;
    throw err;
  }
  return fetchDjangoJson(`/api/business/task/h5/work-orders/${encodeURIComponent(id)}/status/`, {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

async function postWorkOrderDispatchToDb(taskNo, body, token) {
  const id = String(taskNo || "").trim();
  if (!id) {
    const err = new Error("work_order_id_required");
    err.status = 400;
    throw err;
  }
  return fetchDjangoJson(`/api/business/task/h5/work-orders/${encodeURIComponent(id)}/dispatch/`, {
    token,
    method: "POST",
    body: body && typeof body === "object" ? body : {},
  });
}

function isTaskDataFromDb() {
  const raw = String(process.env.TASK_DATA_SOURCE || "db").trim().toLowerCase();
  if (raw === "json" || raw === "file" || raw === "local") return false;
  return raw === "db" || raw === "database" || raw === "1" || raw === "true" || raw === "yes";
}

module.exports = {
  isTaskDataFromDb,
  fetchDjangoJson,
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
  buildSlotSeqMap,
};
