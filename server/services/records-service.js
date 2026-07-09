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
  const filtered = rows.filter((r) => {
    const imageText = Array.isArray(r && r.images) ? r.images.join(" ") : "";
    const text = [
      r && r.id,
      r && r.code,
      r && r.taskId,
      r && r.taskSeq,
      r && r.trainNo,
      r && r.maintType,
      r && r.date,
      r && r.desc,
      r && r.issueText,
      r && r.employeeId,
      imageText,
    ].join(" ");
    return normalize(text).includes(q);
  });
  return filtered.slice(0, nLimit);
}

module.exports = { queryRecords };
