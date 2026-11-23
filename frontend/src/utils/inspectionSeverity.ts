/** 异常等级（仅 status=abnormal 时使用） */

export type AbnormalSeverity = 'severe' | 'moderate' | 'minor' | 'undetectable'

/** 下拉顺序：严重 → 中等 → 一般 → 无法检查 */
export const ABNORMAL_SEVERITY_OPTIONS: AbnormalSeverity[] = [
  'severe',
  'moderate',
  'minor',
  'undetectable',
]

export function normalizeAbnormalSeverity(raw: unknown): AbnormalSeverity | '' {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'severe' || s === 'moderate' || s === 'minor' || s === 'undetectable') return s
  return ''
}

/** 从入库 result 文案反推等级（兼容历史数据） */
export function parseSeverityFromResultText(result: unknown): AbnormalSeverity | '' {
  const text = String(result || '')
  if (
    text.includes('（无法检查）')
    || text.includes('（无法检测）')
    || /\(\s*undetectable\s*\)/i.test(text)
  ) {
    return 'undetectable'
  }
  if (text.includes('（高风险）') || text.includes('（严重）') || /\(\s*severe\s*\)/i.test(text)) {
    return 'severe'
  }
  if (text.includes('（中风险）') || text.includes('（中等）') || /\(\s*moderate\s*\)/i.test(text)) {
    return 'moderate'
  }
  if (text.includes('（低风险）') || text.includes('（一般）') || /\(\s*minor\s*\)/i.test(text)) {
    return 'minor'
  }
  return ''
}
