/**
 * 附加槽位紧凑重排（与 frontend/src/utils/uploadSlots.ts 保持一致）
 */
const EXTRA_UPLOAD_SLOT_MARKER = "__extra_";

function parseExtraUploadIndex(slotId) {
  const m = String(slotId).match(/__extra_(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildExtraUploadSlotId(baseSlotId, index) {
  return `${String(baseSlotId).trim()}__extra_${index}`;
}

function listExtraUploadSlotIds(baseSlotId, slotKeys) {
  const prefix = `${String(baseSlotId).trim()}__extra_`;
  const ids = [];
  for (const key of slotKeys) {
    const id = String(key || "").trim();
    if (id.startsWith(prefix)) ids.push(id);
  }
  return ids.sort(
    (a, b) => (parseExtraUploadIndex(a) || 0) - (parseExtraUploadIndex(b) || 0),
  );
}

function buildCompactUploadSlotMoves(baseSlotId, slotKeys, slotHasContent) {
  const base = String(baseSlotId || "").trim();
  if (!base) return [];
  const ordered = [];
  if (slotHasContent(base)) ordered.push(base);
  for (const id of listExtraUploadSlotIds(base, slotKeys)) {
    if (slotHasContent(id)) ordered.push(id);
  }
  return ordered.map((from, index) => {
    if (index === 0) {
      return { from, to: base, extraIndex: null };
    }
    return { from, to: buildExtraUploadSlotId(base, index), extraIndex: index };
  });
}

function groupUploadSlotIds(baseSlotId, slotKeys) {
  const base = String(baseSlotId || "").trim();
  if (!base) return [];
  return [base, ...listExtraUploadSlotIds(base, slotKeys)];
}

function buildExtraDisplayName(baseLabel, index) {
  const base = String(baseLabel || "").trim();
  const suffix = String(Math.max(1, index)).padStart(2, "0");
  return base ? `${base}${suffix}` : suffix;
}

module.exports = {
  buildCompactUploadSlotMoves,
  groupUploadSlotIds,
  buildExtraDisplayName,
  listExtraUploadSlotIds,
};
