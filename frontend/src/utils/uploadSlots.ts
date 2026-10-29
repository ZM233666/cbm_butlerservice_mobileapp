/** 附加照片槽位：`{baseSlot}__extra_{1..n}`，展示名 `{baseLabel}_{n}` */

export const EXTRA_UPLOAD_SLOT_MARKER = '__extra_'

export const MAX_EXTRA_PHOTOS_PER_SLOT = 9

export function isExtraUploadSlot(slotId: string): boolean {
  return String(slotId).includes(EXTRA_UPLOAD_SLOT_MARKER)
}

export function parseExtraUploadIndex(slotId: string): number | null {
  const m = String(slotId).match(/__extra_(\d+)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function getBaseUploadSlotId(slotId: string): string {
  return String(slotId).replace(/__extra_\d+$/, '')
}

export function buildExtraUploadSlotId(baseSlotId: string, index: number): string {
  return `${String(baseSlotId).trim()}__extra_${index}`
}

export function buildExtraDisplayName(baseLabel: string, index: number): string {
  const base = String(baseLabel || '').trim()
  return base ? `${base}_${index}` : `_${index}`
}

export function listExtraUploadSlotIds(baseSlotId: string, slotKeys: Iterable<string>): string[] {
  const prefix = `${String(baseSlotId).trim()}__extra_`
  const ids: string[] = []
  for (const key of slotKeys) {
    const id = String(key || '').trim()
    if (id.startsWith(prefix)) ids.push(id)
  }
  return ids.sort(
    (a, b) => (parseExtraUploadIndex(a) || 0) - (parseExtraUploadIndex(b) || 0),
  )
}

export function nextExtraUploadIndex(baseSlotId: string, slotKeys: Iterable<string>): number {
  let max = 0
  for (const id of listExtraUploadSlotIds(baseSlotId, slotKeys)) {
    const n = parseExtraUploadIndex(id)
    if (n != null && n > max) max = n
  }
  return max + 1
}

export function resolveUploadDisplayName(
  slotId: string,
  baseLabel: string,
  storedDisplayName?: string,
): string {
  const stored = String(storedDisplayName || '').trim()
  if (stored) return stored
  const idx = parseExtraUploadIndex(slotId)
  if (idx != null) return buildExtraDisplayName(baseLabel, idx)
  return String(baseLabel || '').trim()
}
