function normalizeTaskCard(item) {
  if (!item || typeof item !== "object") return null;
  const maint = String(item.maint || "").trim().toLowerCase();
  if (!maint) return null;
  const title = String(item.title || "").trim() || maint.toUpperCase();
  const meta = String(item.meta || "").trim() || "CCBII · Maintenance";
  const deadline = String(item.deadline || "").trim() || "";
  const href = String(item.href || "").trim() || `/task-list.html?maint=${maint}`;
  const taskId = String(item.taskId || "").trim();
  const depot = String(item.depot || "").trim();
  return { maint, title, meta, deadline, href, taskId: taskId || undefined, depot: depot || undefined };
}

function buildHomeConfig(raw) {
  const tasks = Array.isArray(raw && raw.tasks) ? raw.tasks : [];
  const recommendations = Array.isArray(raw && raw.recommendations) ? raw.recommendations : [];
  const normalizedTasks = tasks.map(normalizeTaskCard).filter(Boolean);
  const normalizedRecs = recommendations.map(normalizeTaskCard).filter(Boolean);
  if (normalizedTasks.length > 0 || normalizedRecs.length > 0) {
    const out = {};
    if (normalizedTasks.length > 0) out.tasks = normalizedTasks;
    if (normalizedRecs.length > 0) out.recommendations = normalizedRecs;
    return out;
  }
  return {
    tasks: [
      {
        maint: "c4c6",
        title: "C4/C6",
        meta: "CCBII · Maintenance",
        deadline: "2026-04-30",
        href: "/task-list.html?maint=c4c6",
      },
      {
        maint: "c1c3",
        title: "C1/C3",
        meta: "CCBII · Maintenance",
        deadline: "2026-04-30",
        href: "/task-list.html?maint=c1c3",
      },
    ],
  };
}

module.exports = { buildHomeConfig };
