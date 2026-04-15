const DEFAULT_FSE_MEMBERS = [
  { employeeId: "20028289", name: "Maison Miao", email: "maison.miao@knorr-bremse.com" },
  { employeeId: "20030123", name: "Liam Chen", email: "liam.chen@knorr-bremse.com" },
  { employeeId: "20035678", name: "Sophie Wang", email: "sophie.wang@knorr-bremse.com" },
];

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeMaint(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (raw === "c1c3") return "c1c3";
  if (raw === "c4c6" || raw === "c4-c6") return "c4c6";
  return "";
}

function normalizeStatus(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (raw === "todo" || raw === "doing" || raw === "done") return raw;
  return "todo";
}

function normalizeMonth(v) {
  const raw = String(v || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 7);
}

function monthFromValue(v) {
  const text = normalizeText(v);
  if (text.length >= 7 && /^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  return "";
}

function toIsoOrEmpty(v) {
  const text = normalizeText(v);
  if (!text) return "";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function normalizeFseMember(raw) {
  const m = raw && typeof raw === "object" ? raw : {};
  const employeeId = normalizeText(m.employeeId);
  if (!employeeId) return null;
  return {
    employeeId,
    name: normalizeText(m.name) || employeeId,
    email: normalizeText(m.email),
  };
}

function normalizeAssignment(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const id = normalizeText(row.id);
  if (!id) return null;
  const assignedTo = row.assignedTo && typeof row.assignedTo === "object" ? row.assignedTo : {};
  return {
    id,
    maint: normalizeMaint(row.maint) || "c4c6",
    vehicleNo: normalizeText(row.vehicleNo),
    depot: normalizeText(row.depot),
    deadline: normalizeText(row.deadline),
    report: normalizeText(row.report),
    reportUrl: normalizeText(row.reportUrl),
    status: normalizeStatus(row.status),
    createdAt: toIsoOrEmpty(row.createdAt) || new Date().toISOString(),
    assignedTo: {
      employeeId: normalizeText(assignedTo.employeeId),
      name: normalizeText(assignedTo.name),
      email: normalizeText(assignedTo.email),
    },
    createdBy: {
      employeeId: normalizeText(row.createdBy && row.createdBy.employeeId),
      name: normalizeText(row.createdBy && row.createdBy.name),
    },
  };
}

function normalizeAssignmentsStore(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const membersRaw = Array.isArray(src.fseMembers) ? src.fseMembers : [];
  const assignmentsRaw = Array.isArray(src.assignments) ? src.assignments : [];
  const fseMembers = membersRaw.map(normalizeFseMember).filter(Boolean);
  const assignments = assignmentsRaw.map(normalizeAssignment).filter(Boolean);
  return {
    fseMembers: fseMembers.length ? fseMembers : DEFAULT_FSE_MEMBERS,
    assignments,
  };
}

function buildManagerDashboard(payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const store = normalizeAssignmentsStore(src.store);
  const month = normalizeMonth(src.month);
  const records = Array.isArray(src.records) ? src.records : [];
  const assignments = store.assignments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const monthAssignments = assignments.filter((row) => {
    const serviceMonth = monthFromValue(row.deadline) || monthFromValue(row.createdAt);
    return serviceMonth === month;
  });
  const monthRecords = records.filter((r) => monthFromValue(r.date) === month);
  const monthlyServiceTotal = monthRecords.length + monthAssignments.filter((x) => x.status === "done").length;

  const overview = {
    total: assignments.length,
    todo: assignments.filter((x) => x.status === "todo").length,
    doing: assignments.filter((x) => x.status === "doing").length,
    done: assignments.filter((x) => x.status === "done").length,
  };

  const vehiclesNeedService = [];
  const vehicleSet = new Set();
  assignments.forEach((row) => {
    if (row.status === "done") return;
    if (!row.vehicleNo || vehicleSet.has(row.vehicleNo)) return;
    vehicleSet.add(row.vehicleNo);
    vehiclesNeedService.push({
      vehicleNo: row.vehicleNo,
      maint: row.maint,
      deadline: row.deadline,
      assignedTo: row.assignedTo,
      status: row.status,
    });
  });

  const progress = {
    done: overview.done,
    total: overview.total,
    percentage: overview.total ? Math.round((overview.done / overview.total) * 100) : 0,
  };

  const reports = assignments
    .filter((row) => row.report || row.status === "done")
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      title: row.report || `${row.vehicleNo || "-"} 服务报告`,
      reportUrl: row.reportUrl || "",
      reportApi: `/api/manager/reports/${encodeURIComponent(row.id)}.pdf`,
      vehicleNo: row.vehicleNo,
      maint: row.maint,
      assignedTo: row.assignedTo,
      status: row.status,
      deadline: row.deadline,
    }));

  const fseWorkload = store.fseMembers.map((member) => {
    const rows = assignments.filter((row) => row.assignedTo.employeeId === member.employeeId);
    return {
      ...member,
      total: rows.length,
      todo: rows.filter((x) => x.status === "todo").length,
      doing: rows.filter((x) => x.status === "doing").length,
      done: rows.filter((x) => x.status === "done").length,
    };
  });

  return {
    month,
    monthlyServiceTotal,
    overview,
    progress,
    vehiclesNeedService: vehiclesNeedService.slice(0, 10),
    reports,
    byMaint: {
      c1c3: assignments.filter((x) => x.maint === "c1c3").length,
      c4c6: assignments.filter((x) => x.maint === "c4c6").length,
    },
    fseMembers: store.fseMembers,
    fseWorkload,
    assignments: assignments.slice(0, 50),
  };
}

function createAssignment(payload, fseMembers) {
  const src = payload && typeof payload === "object" ? payload : {};
  const members = Array.isArray(fseMembers) ? fseMembers : [];
  const maint = normalizeMaint(src.maint);
  const vehicleNo = normalizeText(src.vehicleNo);
  const deadline = normalizeText(src.deadline);
  const report = normalizeText(src.report);
  const assignedToEmployeeId = normalizeText(src.assignedToEmployeeId);
  if (!maint) return { error: "maint_invalid" };
  if (!vehicleNo) return { error: "vehicle_required" };
  if (!assignedToEmployeeId) return { error: "assignee_required" };

  const member = members.find((m) => m.employeeId === assignedToEmployeeId);
  if (!member) return { error: "assignee_not_found" };

  const assignment = {
    id: `asg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    maint,
    vehicleNo,
    depot: normalizeText(src.depot),
    deadline,
    report,
    reportUrl: normalizeText(src.reportUrl),
    status: "todo",
    createdAt: new Date().toISOString(),
    assignedTo: {
      employeeId: member.employeeId,
      name: member.name,
      email: member.email,
    },
    createdBy: {
      employeeId: normalizeText(src.createdBy && src.createdBy.employeeId),
      name: normalizeText(src.createdBy && src.createdBy.name),
    },
  };
  return { assignment };
}

module.exports = {
  DEFAULT_FSE_MEMBERS,
  normalizeAssignmentsStore,
  buildManagerDashboard,
  createAssignment,
};
