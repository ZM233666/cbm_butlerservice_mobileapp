/**
 * 与 frontend/src/utils/issueSubmitFormat.ts 对齐：draft/submit 前规范化 issues。
 */
const ABNORMAL_SEVERITIES = new Set(["severe", "moderate", "minor"]);

function normalizeAbnormalSeverity(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return ABNORMAL_SEVERITIES.has(s) ? s : "";
}

const SEVERITY_LABEL_ZH = {
  severe: "严重",
  moderate: "中等",
  minor: "一般",
};

function parseSeverityFromResultText(result) {
  const text = String(result || "");
  if (text.includes("（严重）") || /\(\s*severe\s*\)/i.test(text)) return "severe";
  if (text.includes("（中等）") || /\(\s*moderate\s*\)/i.test(text)) return "moderate";
  if (text.includes("（一般）") || /\(\s*minor\s*\)/i.test(text)) return "minor";
  return "";
}

function formatIssueResultZh(status, text, severity) {
  const labelBase = {
    ok: "检查正常",
    abnormal: "发现异常",
    undetectable: "无法检测",
    no_equipment: "无此设备",
  };
  let label = labelBase[status] || "";
  const sev = normalizeAbnormalSeverity(severity);
  if (status === "abnormal" && sev) {
    const sevLabel = SEVERITY_LABEL_ZH[sev];
    if (sevLabel) label = `${label}（${sevLabel}）`;
  }
  const detail = String(text || "").trim();
  if (!label) return detail;
  if (status === "ok" || status === "no_equipment") {
    return detail && detail !== label ? `${label}：${detail}` : label;
  }
  return detail && detail !== label ? `${label}：${detail}` : label;
}

/** 补全 abnormal 的 severity / result，便于 Django 入库 */
function enrichIssueSubmitEntry(meta) {
  if (!meta || typeof meta !== "object") return meta;
  let status = String(meta.status || "").trim().toLowerCase();
  if (status === "normal") status = "ok";
  const text = String(meta.text || "").trim();
  let severity = normalizeAbnormalSeverity(meta.severity);
  if (!severity && status === "abnormal") {
    severity = parseSeverityFromResultText(meta.result);
  }
  const row = { ...meta, status, text };
  if (status === "abnormal" && severity) {
    row.severity = severity;
    row.result = formatIssueResultZh(status, text, severity);
  } else if (status && text) {
    const formatted = formatIssueResultZh(status, text, "");
    if (formatted) row.result = formatted;
  }
  return row;
}

function enrichIssuesMap(issues) {
  const src = issues && typeof issues === "object" ? issues : {};
  const out = {};
  Object.entries(src).forEach(([rowId, meta]) => {
    const key = String(rowId || "").trim();
    if (!key) return;
    out[key] = enrichIssueSubmitEntry(meta);
  });
  return out;
}

module.exports = {
  parseSeverityFromResultText,
  formatIssueResultZh,
  enrichIssueSubmitEntry,
  enrichIssuesMap,
};
