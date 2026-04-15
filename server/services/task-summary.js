function allowedByMaintCategory(row, maintType) {
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
}

function countPhotos(row) {
  return Array.isArray(row.buttons) ? row.buttons.length : 0;
}

function buildTaskSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const c1Rows = list.filter((row) => allowedByMaintCategory(row, "c1c3"));
  const c4Rows = list.filter((row) => allowedByMaintCategory(row, "c4c6"));

  const perSeq = list.map((row) => {
    const c1Visible = allowedByMaintCategory(row, "c1c3");
    const c4Visible = allowedByMaintCategory(row, "c4c6");
    return {
      seq: row.seq,
      scopeTags: row.scopeTags || [],
      c1c3: c1Visible ? countPhotos(row) : null,
      c4c6: c4Visible ? countPhotos(row) : null,
    };
  });

  return {
    totalRows: list.length,
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
    perSeq,
  };
}

module.exports = { allowedByMaintCategory, buildTaskSummary };
