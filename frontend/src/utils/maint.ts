/** 修程：业务存储为 c1–c6；子任务模版仍为 c1c3 / c4c6 两套。 */

export const MAINT_LEVELS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const
export type MaintLevel = (typeof MAINT_LEVELS)[number]
export type MaintTemplate = 'c1c3' | 'c4c6'

const LEVEL_SET = new Set<string>(MAINT_LEVELS)

function compactMaint(raw: unknown): string {
  return String(raw || '').trim().toLowerCase().replace(/[/\s_-]/g, '')
}

/** 归一化为存储值 c1–c6；兼容旧值 c1c3 / c4c6。 */
export function normalizeMaint(raw: unknown): MaintLevel | '' {
  const v = compactMaint(raw)
  if (LEVEL_SET.has(v)) return v as MaintLevel
  // 旧聚合档：读库兼容，归一到代表档
  if (v === 'c1c3') return 'c1'
  if (v === 'c4c6') return 'c4'
  return ''
}

/** 映射到子任务/检查项模版键（指导书 scopeTags）。 */
export function maintToTemplate(raw: unknown): MaintTemplate | '' {
  const v = compactMaint(raw)
  if (v === 'c1' || v === 'c2' || v === 'c3' || v === 'c1c3') return 'c1c3'
  if (v === 'c4' || v === 'c5' || v === 'c6' || v === 'c4c6') return 'c4c6'
  return ''
}

/**
 * 展示标签：
 * - 新值 c1–c6 → C1 … C6
 * - 旧聚合值保持 C1～C3 / C4～C6（未迁移的历史任务）
 */
export function formatMaintLabel(raw: unknown): string {
  const v = compactMaint(raw)
  if (v === 'c1c3') return 'C1～C3'
  if (v === 'c4c6') return 'C4～C6'
  if (LEVEL_SET.has(v)) return v.toUpperCase()
  return String(raw || '').trim().toUpperCase() || '-'
}

export function isMaintLevel(raw: unknown): raw is MaintLevel {
  return LEVEL_SET.has(String(raw || '').trim().toLowerCase())
}
