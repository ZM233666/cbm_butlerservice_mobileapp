function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function queryRecords(allRows, keyword, limit) {
  const q = normalize(keyword);
  const nLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  if (!q) return [];
  const rows = Array.isArray(allRows) ? allRows : [];
  const filtered = rows.filter((r) =>
    normalize([r.id, r.code, r.taskSeq, r.trainNo, r.maintType, r.date, r.desc].join(" ")).includes(q)
  );
  return filtered.slice(0, nLimit);
}

module.exports = { queryRecords };
