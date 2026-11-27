const {
  buildTaskSummaryFromDoc,
  getTemplateRows,
  selectTemplateKey,
} = require("./guidance-template");

function countPhotos(row) {
  return Array.isArray(row && row.buttons) ? row.buttons.length : 0;
}

/**
 * 兼容旧单表 rows + scopeTags；新版传完整 guidance doc。
 */
function buildTaskSummary(input) {
  if (input && input.templates && typeof input.templates === "object") {
    return buildTaskSummaryFromDoc(input);
  }

  // 旧格式兜底（仅测试/历史数据）
  const list = Array.isArray(input) ? input : Array.isArray(input && input.rows) ? input.rows : [];
  const allowed = (row, maintType) => {
    const scope = Array.isArray(row.scopeTags) ? row.scopeTags : [];
    if (maintType === "c1c3") {
      if (scope.length === 1 && scope[0] === "c4c6") return false;
      return true;
    }
    if (maintType === "c4c6") {
      if (scope.length === 1 && scope[0] === "c1c3") return false;
      return true;
    }
    return true;
  };
  const c1Rows = list.filter((row) => allowed(row, "c1c3"));
  const c4Rows = list.filter((row) => allowed(row, "c4c6"));
  return {
    version: "",
    templates: {},
    maint: {
      c1c3: {
        items: c1Rows.length,
        photos: c1Rows.reduce((n, row) => n + countPhotos(row), 0),
      },
      c4c6: {
        items: c4Rows.length,
        photos: c4Rows.reduce((n, row) => n + countPhotos(row), 0),
      },
    },
    perSeq: list.map((row) => {
      const c1Visible = allowed(row, "c1c3");
      const c4Visible = allowed(row, "c4c6");
      return {
        seq: row.seq,
        scopeTags: row.scopeTags || [],
        c1c3: c1Visible ? countPhotos(row) : null,
        c4c6: c4Visible ? countPhotos(row) : null,
      };
    }),
  };
}

function photoCountFor(doc, modelOrTrainNo, maint) {
  const key = selectTemplateKey(modelOrTrainNo, maint, doc && doc.templateSelection);
  const rows = getTemplateRows(doc, key);
  return {
    templateKey: key,
    items: rows.length,
    photos: rows.reduce((n, row) => n + countPhotos(row), 0),
  };
}

module.exports = {
  buildTaskSummary,
  photoCountFor,
};
