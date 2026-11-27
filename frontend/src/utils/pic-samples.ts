/**
 * PicSamples 样例图 ↔ 上传按钮 label 映射（用于 instruction「获取帮助」）。
 * 优先精确文件名；组合图 / 轴型变体（EBVA→EBV、LCDMA→LCDM）用别名。
 */

import type { GuidanceRow } from '@/types/task'

/** 无法用「label.png」直接命中时的显式别名（值为带扩展名的文件名） */
const LABEL_ALIAS: Record<string, string> = {
  'Abnormal Log': 'Abnormal Log1.png',
  'BCM Plug1': 'BCM Plug1_Plug2.png',
  'BCM Plug2': 'BCM Plug1_Plug2.png',
  HDLC1: 'HDLC1_2.png',
  HDLC2: 'HDLC1_2.png',
  'IPM J1': 'IPM J1_J4_J5_J6.png',
  'IPM J4': 'IPM J1_J4_J5_J6.png',
  'IPM J5': 'IPM J1_J4_J5_J6.png',
  'IPM J6': 'IPM J1_J4_J5_J6.png',
  'IPM PN': 'IPM PN_SN.png',
  'IPM SN': 'IPM PN_SN.png',
  J100A: 'J100A_101_102.png',
  J100B: 'J100A_101_102.png',
  J101: 'J100A_101_102.png',
  J102: 'J100A_101_102.png',
  继电器1: '继电器1_2_3_4.png',
  继电器2: '继电器1_2_3_4.png',
  继电器3: '继电器1_2_3_4.png',
  继电器4: '继电器1_2_3_4.png',
}

/** 已知存在的精确 stem（与 PicSamples/*.png 一致，不含扩展名） */
const EXACT_STEMS = new Set([
  '13CP SN',
  '16CP SN',
  '20CP SN',
  'A71',
  'BCCP SN',
  'BCM SN',
  'BPCP SN',
  'DBTV SN',
  'EBV PIPE',
  'EBV PLUG',
  'EBV SOCKET',
  'EBV铭牌',
  'EPCU SW',
  'ERCP SN',
  'IPM J6C',
  'IPM Socket',
  'J103',
  'LCDM Plug',
  'LCDM SW',
  'LCDM铭牌',
  'LOCO Number',
  'MB04B MMI',
  'PSJB SN',
  'U99',
  'WSP SN',
  '总风滤芯',
  '继电器箱',
  '辅助模块',
])

function normalizeLabelVariant(label: string): string {
  let s = String(label || '').trim()
  for (const [pref, repl] of [
    ['EBVA', 'EBV'],
    ['EBVB', 'EBV'],
    ['LCDMA', 'LCDM'],
    ['LCDMB', 'LCDM'],
  ] as const) {
    if (s.startsWith(pref)) {
      s = repl + s.slice(pref.length)
      break
    }
  }
  return s
}

/** 返回 PicSamples 下的文件名（含 .png）；无则空串 */
export function resolvePicSampleFileForLabel(label: unknown): string {
  const raw = String(label || '').trim()
  if (!raw) return ''
  if (LABEL_ALIAS[raw]) return LABEL_ALIAS[raw]
  if (EXACT_STEMS.has(raw)) return `${raw}.png`
  const normalized = normalizeLabelVariant(raw)
  if (normalized !== raw) {
    if (LABEL_ALIAS[normalized]) return LABEL_ALIAS[normalized]
    if (EXACT_STEMS.has(normalized)) return `${normalized}.png`
  }
  return ''
}

/** 按行内上传按钮顺序取第一张可用样例图文件名 */
export function resolvePicSampleFileForRow(
  row: Pick<GuidanceRow, 'buttons' | 'seq'> | null | undefined,
): string {
  if (!row) return ''
  const buttons = Array.isArray(row.buttons) ? row.buttons : []
  for (const btn of buttons) {
    const file = resolvePicSampleFileForLabel(btn?.label)
    if (file) return file
  }
  return ''
}

export function picSampleUrl(fileName: string): string {
  const name = String(fileName || '').trim()
  if (!name) return ''
  return `/PicSamples/${encodeURIComponent(name)}`
}

export function rowHasPicSample(row: Pick<GuidanceRow, 'buttons' | 'seq'> | null | undefined): boolean {
  return !!resolvePicSampleFileForRow(row)
}
