/**
 * 修程：业务存储 c1–c6；子任务模版仍为 c1c3 / c4c6。
 * Node 与各 service 共用同一套归一与映射。
 */

const LEVELS = new Set(["c1", "c2", "c3", "c4", "c5", "c6"]);

function compactMaint(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[/\s_-]/g, "");
}

function normalizeMaint(raw) {
  const v = compactMaint(raw);
  if (LEVELS.has(v)) return v;
  if (v === "c1c3") return "c1";
  if (v === "c4c6") return "c4";
  return "";
}

/** 保留原始合法业务值（含旧聚合档），用于兼容读；非法返回 ""。 */
function coerceMaint(raw) {
  const v = compactMaint(raw);
  if (LEVELS.has(v)) return v;
  if (v === "c1c3" || v === "c4c6") return v;
  return "";
}

function maintToTemplate(raw) {
  const v = compactMaint(raw);
  if (v === "c1" || v === "c2" || v === "c3" || v === "c1c3") return "c1c3";
  if (v === "c4" || v === "c5" || v === "c6" || v === "c4c6") return "c4c6";
  return "";
}

function formatMaintLabel(raw) {
  const v = compactMaint(raw);
  if (v === "c1c3") return "C1～C3";
  if (v === "c4c6") return "C4～C6";
  if (LEVELS.has(v)) return v.toUpperCase();
  return String(raw || "").trim().toUpperCase() || "-";
}

module.exports = {
  MAINT_LEVELS: ["c1", "c2", "c3", "c4", "c5", "c6"],
  normalizeMaint,
  coerceMaint,
  maintToTemplate,
  formatMaintLabel,
};
