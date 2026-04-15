function normalizeTaskCard(item) {
  if (!item || typeof item !== "object") return null;
  const maint = String(item.maint || "").trim().toLowerCase();
  if (!maint) return null;
  const title = String(item.title || "").trim() || maint.toUpperCase();
  const meta = String(item.meta || "").trim() || "CCBII · Maintenance";
  const deadline = String(item.deadline || "").trim() || "";
  const href = String(item.href || "").trim() || `/task-list.html?maint=${maint}`;
  const taskId = String(item.taskId || "").trim();
  return { maint, title, meta, deadline, href, taskId: taskId || undefined };
}

function buildHomeConfig(raw) {
  const tasks = Array.isArray(raw && raw.tasks) ? raw.tasks : [];
  const normalized = tasks.map(normalizeTaskCard).filter(Boolean);
  if (normalized.length > 0) return { tasks: normalized };
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
