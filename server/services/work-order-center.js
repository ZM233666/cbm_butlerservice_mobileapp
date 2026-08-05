const VALID_ROLES = new Set(["fse", "manager"]);
const VALID_STATUS = new Set(["todo", "doing", "done"]);

const { normalizeMaint, maintToTemplate, formatMaintLabel, MAINT_LEVELS } = require("./maint");

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeRole(v) {
  const role = normalizeText(v).toLowerCase();
  return VALID_ROLES.has(role) ? role : "";
}

function defaultRegionByRole(role) {
  if (role === "manager") return "Suzhou";
  if (role === "fse") return "Shanghai";
  return "";
}

function normalizeStatus(v) {
  const status = normalizeText(v).toLowerCase();
  return VALID_STATUS.has(status) ? status : "";
}

function normalizeBoolean(v) {
  if (typeof v === "boolean") return v;
  const text = normalizeText(v).toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function normalizeIso(v) {
  const text = normalizeText(v);
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function normalizeStringList(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeCertificateStatus(v) {
  const status = normalizeText(v).toLowerCase();
  if (status === "valid" || status === "expiring" || status === "expired") return status;
  return "valid";
}

function normalizeCertificates(input) {
  if (!Array.isArray(input)) return [];
  const list = [];
  input.forEach((item) => {
    if (typeof item === "string") {
      const name = normalizeText(item);
      if (name) list.push({ name, status: "valid" });
      return;
    }
    const src = item && typeof item === "object" ? item : null;
    if (!src) return;
    const name = normalizeText(src.name);
    if (!name) return;
    const id = normalizeText(src.id);
    const issuer = normalizeText(src.issuer);
    const validUntil = normalizeText(src.validUntil);
    const photoUrl = normalizeText(src.photoUrl);
    list.push({
      name,
      ...(id ? { id } : {}),
      ...(issuer ? { issuer } : {}),
      ...(validUntil ? { validUntil } : {}),
      ...(photoUrl ? { photoUrl } : {}),
      status: normalizeCertificateStatus(src.status),
    });
  });
  return list;
}

function normalizeUser(input) {
  const src = input && typeof input === "object" ? input : {};
  const employeeId = normalizeText(src.employeeId);
  if (!employeeId) return null;
  const role = normalizeRole(src.role) || "fse";
  const username = normalizeText(src.username) || employeeId;
  const email = normalizeText(src.email);
  const department = normalizeText(src.department);
  const region = normalizeText(src.region) || defaultRegionByRole(role);
  const specialWorkCertificates = normalizeCertificates(src.specialWorkCertificates);
  const qualifications = normalizeStringList(src.qualifications);
  const skillLevel = normalizeText(src.skillLevel);
  const skillTypes = normalizeStringList(src.skillTypes);
  return {
    employeeId,
    username,
    email,
    department,
    region,
    role,
    specialWorkCertificates,
    qualifications,
    ...(skillLevel ? { skillLevel } : {}),
    skillTypes,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeUsersStore(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const users = Array.isArray(src.users) ? src.users : [];
  const map = new Map();
  users.forEach((row) => {
    const normalized = normalizeUser(row);
    if (!normalized) return;
    map.set(normalized.employeeId, normalized);
  });
  return { users: Array.from(map.values()) };
}

function upsertUser(store, input) {
  const base = normalizeUsersStore(store);
  const normalized = normalizeUser(input);
  if (!normalized) return { error: "employee_id_required" };
  const next = base.users.slice();
  const idx = next.findIndex((x) => x.employeeId === normalized.employeeId);
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      ...normalized,
      role: normalizeRole(input && input.role) || next[idx].role || "fse",
      updatedAt: new Date().toISOString(),
    };
  } else {
    next.push(normalized);
  }
  return { store: { users: next }, user: idx >= 0 ? next[idx] : normalized };
}

function normalizeWorkOrder(input) {
  const src = input && typeof input === "object" ? input : {};
  const id = normalizeText(src.id);
  if (!id) return null;
  const status = normalizeStatus(src.status) || "todo";
  return {
    id,
    source: normalizeText(src.source) || "",
    maint: normalizeMaint(src.maint) || "c4",
    vehicleNo: normalizeText(src.vehicleNo),
    title: normalizeText(src.title) || `${normalizeText(src.vehicleNo) || "Vehicle"} Service`,
    deadline: normalizeText(src.deadline),
    status,
    report: normalizeText(src.report),
    reportUrl: normalizeText(src.reportUrl),
    depot: normalizeText(src.depot),
    requiresSpecialWorkCertificate: normalizeBoolean(src.requiresSpecialWorkCertificate),
    requiredCertificateName: normalizeText(src.requiredCertificateName),
    assignedTo: {
      employeeId: normalizeText(src.assignedTo && src.assignedTo.employeeId),
      name: normalizeText(src.assignedTo && src.assignedTo.name),
      email: normalizeText(src.assignedTo && src.assignedTo.email),
    },
    createdBy: {
      employeeId: normalizeText(src.createdBy && src.createdBy.employeeId),
      name: normalizeText(src.createdBy && src.createdBy.name),
    },
    createdAt: normalizeIso(src.createdAt) || new Date().toISOString(),
    updatedAt: normalizeIso(src.updatedAt) || normalizeIso(src.createdAt) || new Date().toISOString(),
  };
}

function normalizeWorkOrderStore(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const assignments = Array.isArray(src.assignments) ? src.assignments : [];
  const list = assignments.map(normalizeWorkOrder).filter(Boolean);
  return {
    fseMembers: Array.isArray(src.fseMembers) ? src.fseMembers : [],
    assignments: list,
  };
}

function monthOf(v) {
  const text = normalizeText(v);
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  return "";
}

function buildFseMembersFromUsers(usersStore) {
  const users = normalizeUsersStore(usersStore).users;
  return users
    .filter((u) => u.role === "fse")
    .map((u) => ({
      employeeId: u.employeeId,
      name: u.username,
      email: u.email,
      specialWorkCertificates: normalizeCertificates(u.specialWorkCertificates),
    }));
}

function createWorkOrder(payload, usersStore) {
  const src = payload && typeof payload === "object" ? payload : {};
  const maint = normalizeMaint(src.maint);
  const vehicleNo = normalizeText(src.vehicleNo);
  const deadline = normalizeText(src.deadline);
  const assignedToEmployeeId = normalizeText(src.assignedToEmployeeId);
  if (!maint) return { error: "maint_invalid" };
  if (!vehicleNo) return { error: "vehicle_required" };
  if (!assignedToEmployeeId) return { error: "assignee_required" };
  const users = normalizeUsersStore(usersStore).users;
  const assignee = users.find((u) => u.employeeId === assignedToEmployeeId && u.role === "fse");
  if (!assignee) return { error: "assignee_not_found" };
  const createdBy = src.createdBy && typeof src.createdBy === "object" ? src.createdBy : {};
  const now = new Date().toISOString();
  const preferredId = normalizeText(src.id);
  const assignment = normalizeWorkOrder({
    id: preferredId || `wo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: normalizeText(src.source),
    maint,
    vehicleNo,
    title: normalizeText(src.title) || `${vehicleNo} ${maint.toUpperCase()}`,
    deadline,
    status: "todo",
    report: normalizeText(src.report),
    reportUrl: normalizeText(src.reportUrl),
    depot: normalizeText(src.depot),
    requiresSpecialWorkCertificate: normalizeBoolean(src.requiresSpecialWorkCertificate),
    requiredCertificateName: normalizeText(src.requiredCertificateName),
    assignedTo: {
      employeeId: assignee.employeeId,
      name: assignee.username,
      email: assignee.email,
    },
    createdBy: {
      employeeId: normalizeText(createdBy.employeeId),
      name: normalizeText(createdBy.name),
    },
    createdAt: now,
    updatedAt: now,
  });
  return { assignment };
}

function updateWorkOrderStatus(store, workOrderId, status) {
  const normalizedStatus = normalizeStatus(status);
  if (!normalizedStatus) return { error: "status_invalid" };
  const normalized = normalizeWorkOrderStore(store);
  const idx = normalized.assignments.findIndex((x) => x.id === workOrderId);
  if (idx < 0) return { error: "work_order_not_found" };
  const row = normalized.assignments[idx];
  const nextRow = { ...row, status: normalizedStatus, updatedAt: new Date().toISOString() };
  const nextAssignments = normalized.assignments.slice();
  nextAssignments[idx] = nextRow;
  return {
    store: { ...normalized, assignments: nextAssignments },
    assignment: nextRow,
  };
}

function dispatchWorkOrder(store, usersStore, workOrderId, assignedToEmployeeId, patch) {
  const normalized = normalizeWorkOrderStore(store);
  const idx = normalized.assignments.findIndex((x) => x.id === workOrderId);
  if (idx < 0) return { error: "work_order_not_found" };
  const users = normalizeUsersStore(usersStore).users;
  const assignee = users.find((u) => u.employeeId === normalizeText(assignedToEmployeeId) && u.role === "fse");
  if (!assignee) return { error: "assignee_not_found" };
  const current = normalized.assignments[idx];
  const next = {
    ...current,
    assignedTo: {
      employeeId: assignee.employeeId,
      name: assignee.username,
      email: assignee.email,
    },
    status: "todo",
    maint: normalizeMaint(patch && patch.maint) || current.maint,
    deadline: normalizeText(patch && patch.deadline) || current.deadline,
    vehicleNo: normalizeText(patch && patch.vehicleNo) || current.vehicleNo,
    title: normalizeText(patch && patch.title) || current.title,
    depot: normalizeText(patch && patch.depot) || current.depot,
    updatedAt: new Date().toISOString(),
  };
  const nextAssignments = normalized.assignments.slice();
  nextAssignments[idx] = next;
  return { store: { ...normalized, assignments: nextAssignments }, assignment: next };
}

function filterWorkOrders(store, query) {
  const normalized = normalizeWorkOrderStore(store);
  const q = query && typeof query === "object" ? query : {};
  const status = normalizeStatus(q.status);
  const assigneeId = normalizeText(q.assigneeId);
  const month = normalizeText(q.month);
  const maint = normalizeMaint(q.maint);
  const rows = normalized.assignments.filter((row) => {
    if (status && row.status !== status) return false;
    if (assigneeId && row.assignedTo.employeeId !== assigneeId) return false;
    if (maint && row.maint !== maint) return false;
    if (month) {
      const m = monthOf(row.deadline) || monthOf(row.createdAt);
      if (m !== month) return false;
    }
    return true;
  });
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows;
}

function buildWorkOrderStats(store, query) {
  const rows = filterWorkOrders(store, query);
  const byStatus = { todo: 0, doing: 0, done: 0 };
  const byMaint = Object.fromEntries(MAINT_LEVELS.map((level) => [level, 0]));
  const byAssignee = {};
  rows.forEach((row) => {
    byStatus[row.status] += 1;
    if (row.maint && byMaint[row.maint] != null) byMaint[row.maint] += 1;
    const key = row.assignedTo.employeeId || "unassigned";
    if (!byAssignee[key]) {
      byAssignee[key] = {
        employeeId: row.assignedTo.employeeId || "",
        name: row.assignedTo.name || row.assignedTo.employeeId || "Unassigned",
        todo: 0,
        doing: 0,
        done: 0,
        total: 0,
      };
    }
    byAssignee[key].total += 1;
    byAssignee[key][row.status] += 1;
  });
  const total = rows.length;
  const done = byStatus.done;
  return {
    total,
    done,
    doing: byStatus.doing,
    todo: byStatus.todo,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    byStatus,
    byMaint,
    byAssignee: Object.values(byAssignee).sort((a, b) => b.total - a.total),
  };
}

function toTaskCard(assignment) {
  const row = normalizeWorkOrder(assignment);
  if (!row) return null;
  const meta =
    row.source === "cbm_ai"
      ? "CBM AI"
      : "CCBII Maintenance";
  return {
    maint: row.maint,
    title: row.title || row.vehicleNo || row.maint.toUpperCase(),
    meta,
    deadline: row.deadline || "",
    taskId: row.id,
    href: `/task-list?maint=${row.maint}`,
    depot: row.depot || undefined,
  };
}

module.exports = {
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
};
