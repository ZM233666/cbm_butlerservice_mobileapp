/** 异常等级（仅 status=abnormal 时使用） */

export type AbnormalSeverity = 'severe' | 'moderate' | 'minor'

export const ABNORMAL_SEVERITY_OPTIONS: AbnormalSeverity[] = ['severe', 'moderate', 'minor']

export function normalizeAbnormalSeverity(raw: unknown): AbnormalSeverity | '' {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'severe' || s === 'moderate' || s === 'minor') return s
  return ''
}
