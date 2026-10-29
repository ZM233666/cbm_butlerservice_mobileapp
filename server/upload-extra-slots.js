/**
 * 附加照片槽位与作业指导书 slot 序号映射（extra 继承 base slot 的 seq）。
 */

function expandSlotSeqMapForExtraUploads(map, uploads) {
  const out = map && typeof map === "object" ? { ...map } : {};
  const src = uploads && typeof uploads === "object" ? uploads : {};
  Object.keys(src).forEach((slotKey) => {
    const key = String(slotKey || "").trim();
    if (!key || out[key]) return;
    const m = key.match(/^(.+)__extra_(\d+)$/);
    if (!m) return;
    const base = m[1];
    if (out[base]) out[key] = out[base];
  });
  return out;
}

module.exports = {
  expandSlotSeqMapForExtraUploads,
};
