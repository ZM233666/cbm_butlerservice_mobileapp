const MAX_MILEAGE_KM = 9_999_999
const MAX_MILEAGE_DIGITS = String(MAX_MILEAGE_KM).length

/** 输入过程中只保留数字，并限制最大位数 */
export function sanitizeMileageKmDigits(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+(?=\d)/, '')
  const normalized = trimmed || '0'
  return normalized.length > MAX_MILEAGE_DIGITS
    ? normalized.slice(0, MAX_MILEAGE_DIGITS)
    : normalized
}

export function normalizeMileageKmInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null
  const text = String(raw).trim().replace(/,/g, '').replace(/，/g, '')
  if (!text) return null
  const num = Number(text)
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > MAX_MILEAGE_KM) {
    return null
  }
  return num
}

export function formatMileageKmDisplay(raw: unknown): string {
  const n = normalizeMileageKmInput(raw)
  if (n == null) return ''
  return String(n)
}
