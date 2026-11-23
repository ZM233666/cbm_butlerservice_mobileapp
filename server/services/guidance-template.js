/**
 * Digital 管家式服务 V1.0 作业指导书模板选择与读取。
 * 规则来源：public/data/brake-guidance-tasks-v1.0.json → templateSelection
 */

const fs = require("fs");
const path = require("path");

const EIGHT_AXLE_MODELS = new Set(["HXD1", "SS4G", "FXD1B"]);

const DEFAULT_TEMPLATE_BY_MAINT_GROUP = {
  C1C2C3: "6Axle+C1C2C3",
  C4C5C6: "6Axle+C4C5C6",
};

function compactMaint(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[/\s_-]/g, "");
}

/** 归一修程到 C1–C6；兼容旧聚合档。 */
function normalizeMaintCode(raw) {
  const v = compactMaint(raw);
  if (/^C[1-6]$/.test(v)) return v;
  if (v === "C1C3" || v === "C1C2C3") return "C1";
  if (v === "C4C6" || v === "C4C5C6") return "C4";
  return "";
}

function maintGroup(raw) {
  const code = normalizeMaintCode(raw);
  if (code === "C1" || code === "C2" || code === "C3") return "C1C2C3";
  if (code === "C4" || code === "C5" || code === "C6") return "C4C5C6";
  return "";
}

/** 车型展示规则：车号去空白后取前 4 位。例：HXN30020 → HXN3 */
function deriveTrainModelFromTrainNo(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!s) return "";
  return s.slice(0, 4);
}

/**
 * 模板选择用车型 token：优先匹配已知 8 轴完整型号，否则回退前 4 位。
 * 例：HXD1-8888 → HXD1；FXD1B001 → FXD1B；HXN30020 → HXN3
 */
function extractModelToken(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!s) return "";
  const known = ["FXD1B", "HXD1", "SS4G"];
  for (const model of known) {
    if (s === model || s.startsWith(model)) return model;
  }
  return deriveTrainModelFromTrainNo(s);
}

/** 展示用模板名：6Axle+C1C2C3 + c1 → 6Axle·C1 */
function formatGuidanceTemplateLabel(templateKey, maint) {
  const key = String(templateKey || "").trim();
  if (!key) return "";
  const axle = key.split("+")[0] || key;
  const code = normalizeMaintCode(maint);
  if (!code) return axle;
  return `${axle}·${code}`;
}

function modelMatchesRule(modelToken, ruleModels) {
  const list = Array.isArray(ruleModels) ? ruleModels : [];
  if (!list.length) return false;
  if (list.includes("*")) return true;
  const token = String(modelToken || "").trim().toUpperCase();
  if (!token) return false;
  return list.some((m) => String(m || "").trim().toUpperCase() === token);
}

function maintMatchesRule(maintCode, ruleMaint) {
  const list = Array.isArray(ruleMaint) ? ruleMaint : [];
  if (!list.length) return false;
  const code = normalizeMaintCode(maintCode);
  if (!code) return false;
  return list.some((m) => compactMaint(m) === code);
}

/**
 * 按车型 + 修程选择模板键。
 * @returns {string} 如 "6Axle+C4C5C6"
 */
function selectTemplateKey(modelOrTrainNo, maint, selection) {
  const modelToken = extractModelToken(modelOrTrainNo);
  const maintCode = normalizeMaintCode(maint);
  const rules = Array.isArray(selection && selection.rules)
    ? [...selection.rules].sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    : [];

  for (const rule of rules) {
    if (!modelMatchesRule(modelToken, rule.models)) continue;
    if (!maintMatchesRule(maintCode, rule.maintenance)) continue;
    const key = String(rule.template || "").trim();
    if (key) return key;
  }

  const group = maintGroup(maintCode);
  return DEFAULT_TEMPLATE_BY_MAINT_GROUP[group] || "6Axle+C4C5C6";
}

function readGuidanceDoc(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object") {
    throw new Error("guidance_doc_invalid");
  }
  return raw;
}

function getTemplateRows(doc, templateKey) {
  const key = String(templateKey || "").trim();
  const templates = doc && doc.templates && typeof doc.templates === "object" ? doc.templates : {};
  const tpl = templates[key];
  return Array.isArray(tpl && tpl.rows) ? tpl.rows : [];
}

function countPhotos(row) {
  if (!row || !Array.isArray(row.buttons) || !row.buttons.length) return 0;
  // 仅异常时上传的行不计入始终必传 checklist
  if (String(row.uploadRequiredWhen || "always").trim().toLowerCase() === "abnormal") return 0;
  return row.buttons.length;
}

function buildSlotSeqMapFromDoc(doc, modelOrTrainNo, maint) {
  const key = selectTemplateKey(modelOrTrainNo, maint, doc && doc.templateSelection);
  const rows = getTemplateRows(doc, key);
  const map = {};
  rows.forEach((row) => {
    const seq = String((row && row.seq) || "").trim();
    if (!seq) return;
    const buttons = Array.isArray(row.buttons) ? row.buttons : [];
    buttons.forEach((btn) => {
      const slot = String((btn && btn.slot) || "").trim();
      if (slot) map[slot] = seq;
    });
  });
  return { templateKey: key, map };
}

function buildTemplateStats(doc) {
  const templates = doc && doc.templates && typeof doc.templates === "object" ? doc.templates : {};
  const out = {};
  Object.keys(templates).forEach((key) => {
    const rows = getTemplateRows(doc, key);
    out[key] = {
      items: rows.length,
      photos: rows.reduce((n, row) => n + countPhotos(row), 0),
    };
  });
  return out;
}

function buildTaskSummaryFromDoc(doc) {
  const templates = buildTemplateStats(doc);
  const fallbackC1 = templates["6Axle+C1C2C3"] || { items: 0, photos: 0 };
  const fallbackC4 = templates["6Axle+C4C5C6"] || { items: 0, photos: 0 };
  return {
    version: String((doc && doc.version) || "").trim() || "1.0",
    templates,
    // 兼容旧首页卡片：无车型时按 6 轴 fallback 统计
    maint: {
      c1c3: fallbackC1,
      c4c6: fallbackC4,
    },
  };
}

function resolveGuidancePath(projectRoot, configuredPath) {
  if (configuredPath) return configuredPath;
  return path.join(projectRoot, "public", "data", "brake-guidance-tasks-v1.0.json");
}

module.exports = {
  EIGHT_AXLE_MODELS,
  deriveTrainModelFromTrainNo,
  extractModelToken,
  formatGuidanceTemplateLabel,
  normalizeMaintCode,
  maintGroup,
  selectTemplateKey,
  readGuidanceDoc,
  getTemplateRows,
  buildSlotSeqMapFromDoc,
  buildTemplateStats,
  buildTaskSummaryFromDoc,
  resolveGuidancePath,
};
