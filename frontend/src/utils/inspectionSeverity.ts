/** 异常等级（仅 status=abnormal 时使用） */

export type AbnormalSeverity = 'severe' | 'moderate' | 'minor'

export const ABNORMAL_SEVERITY_OPTIONS: AbnormalSeverity[] = ['severe', 'moderate', 'minor']

export function normalizeAbnormalSeverity(raw: unknown): AbnormalSeverity | '' {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'severe' || s === 'moderate' || s === 'minor') return s
  return ''
}

/** 从入库 result 文案反推等级（兼容历史数据） */
export function parseSeverityFromResultText(result: unknown): AbnormalSeverity | '' {
  const text = String(result || '')
  if (text.includes('（严重）') || /\(\s*severe\s*\)/i.test(text)) return 'severe'
  if (text.includes('（中等）') || /\(\s*moderate\s*\)/i.test(text)) return 'moderate'
  if (text.includes('（一般）') || /\(\s*minor\s*\)/i.test(text)) return 'minor'
  return ''
}
