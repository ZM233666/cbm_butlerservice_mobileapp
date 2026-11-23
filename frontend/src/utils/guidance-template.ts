/**
 * Digital 管家式服务 V1.0 作业指导书模板选择。
 * 与 server/services/guidance-template.js 规则保持一致。
 */

export const GUIDANCE_TEMPLATE_KEYS = [
  '8Axle+C1C2C3',
  '8Axle+C4C5C6',
  '6Axle+C1C2C3',
  '6Axle+C4C5C6',
] as const

export type GuidanceTemplateKey = (typeof GUIDANCE_TEMPLATE_KEYS)[number]

export interface GuidanceTemplateSelectionRule {
  priority: number
  models: string[]
  maintenance: string[]
  template: string
  fallback?: boolean
}

export interface GuidanceTemplateSelection {
  sourceSheet?: string
  axleGroups?: Record<string, string[]>
  maintenanceGroups?: Record<string, string[]>
  rules: GuidanceTemplateSelectionRule[]
}

export interface GuidanceButton {
  slot: string
  label: string
}

export interface GuidanceRowV1 {
  id: string
  seq: string
  description: string
  materialNumberInput?: string
  serialNumberInput?: string
  overhaulOrManufactureDateInput?: string
  defaultInspectionResult?: string
  imageNaming?: string
  buttons?: GuidanceButton[]
  applicability?: string
  remarks?: string
  uploadHint?: string
  /** 默认 always；abnormal=仅检查结果为「发现异常」时要求上传 */
  uploadRequiredWhen?: 'always' | 'abnormal'
}

export interface GuidanceTemplateBlock {
  name: string
  rows: GuidanceRowV1[]
}

export interface GuidanceDocV1 {
  source?: string
  version?: string
  templateSelection: GuidanceTemplateSelection
  templates: Record<string, GuidanceTemplateBlock>
}

const EIGHT_AXLE_MODELS = new Set(['HXD1', 'SS4G', 'FXD1B'])

const DEFAULT_TEMPLATE_BY_MAINT_GROUP: Record<string, GuidanceTemplateKey> = {
  C1C2C3: '6Axle+C1C2C3',
  C4C5C6: '6Axle+C4C5C6',
}

function compactMaint(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[/\s_-]/g, '')
}

export function normalizeMaintCode(raw: unknown): string {
  const v = compactMaint(raw)
  if (/^C[1-6]$/.test(v)) return v
  if (v === 'C1C3' || v === 'C1C2C3') return 'C1'
  if (v === 'C4C6' || v === 'C4C5C6') return 'C4'
  return ''
}

export function maintGroup(raw: unknown): 'C1C2C3' | 'C4C5C6' | '' {
  const code = normalizeMaintCode(raw)
  if (code === 'C1' || code === 'C2' || code === 'C3') return 'C1C2C3'
  if (code === 'C4' || code === 'C5' || code === 'C6') return 'C4C5C6'
  return ''
}

/**
 * 车型展示/自动填充规则：车号去空白后取前 4 位。
 * 例：HXN30020 → HXN3；HXD1-8888 → HXD1
 */
export function deriveTrainModelFromTrainNo(raw: unknown): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!s) return ''
  return s.slice(0, 4)
}

/**
 * 模板选择用车型 token：优先匹配已知 8 轴完整型号，否则回退前 4 位。
 */
export function extractModelToken(raw: unknown): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!s) return ''
  // 长的优先，避免 FXD1B 被截成 FXD1
  const known = Array.from(EIGHT_AXLE_MODELS).sort((a, b) => b.length - a.length)
  for (const model of known) {
    if (s === model || s.startsWith(model)) return model
  }
  return deriveTrainModelFromTrainNo(s)
}

/** 展示用模板名：6Axle+C1C2C3 + c1 → 6Axle·C1 */
export function formatGuidanceTemplateLabel(templateKey: unknown, maint: unknown): string {
  const key = String(templateKey || '').trim()
  if (!key) return ''
  const axle = key.split('+')[0] || key
  const code = normalizeMaintCode(maint)
  if (!code) return axle
  return `${axle}·${code}`
}

function modelMatchesRule(modelToken: string, ruleModels: string[] | undefined): boolean {
  const list = Array.isArray(ruleModels) ? ruleModels : []
  if (!list.length) return false
  if (list.includes('*')) return true
  const token = String(modelToken || '').trim().toUpperCase()
  if (!token) return false
  return list.some((m) => String(m || '').trim().toUpperCase() === token)
}

function maintMatchesRule(maintCode: string, ruleMaint: string[] | undefined): boolean {
  const list = Array.isArray(ruleMaint) ? ruleMaint : []
  if (!list.length) return false
  const code = normalizeMaintCode(maintCode)
  if (!code) return false
  return list.some((m) => compactMaint(m) === code)
}

export function selectTemplateKey(
  modelOrTrainNo: unknown,
  maint: unknown,
  selection?: GuidanceTemplateSelection | null,
): GuidanceTemplateKey {
  const modelToken = extractModelToken(modelOrTrainNo)
  const maintCode = normalizeMaintCode(maint)
  const rules = Array.isArray(selection?.rules)
    ? [...selection!.rules].sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    : []

  for (const rule of rules) {
    if (!modelMatchesRule(modelToken, rule.models)) continue
    if (!maintMatchesRule(maintCode, rule.maintenance)) continue
    const key = String(rule.template || '').trim()
    if (GUIDANCE_TEMPLATE_KEYS.includes(key as GuidanceTemplateKey)) {
      return key as GuidanceTemplateKey
    }
    if (key) return key as GuidanceTemplateKey
  }

  const group = maintGroup(maintCode)
  return DEFAULT_TEMPLATE_BY_MAINT_GROUP[group] || '6Axle+C4C5C6'
}

export function getTemplateRows(
  doc: GuidanceDocV1 | null | undefined,
  templateKey: string,
): GuidanceRowV1[] {
  const key = String(templateKey || '').trim()
  const tpl = doc?.templates?.[key]
  return Array.isArray(tpl?.rows) ? tpl.rows : []
}

/** 是否将本行按钮计入「始终必传」照片数（条件必传行不计入 checklist 基准）。 */
export function countsTowardAlwaysRequiredUploads(
  row: Pick<GuidanceRowV1, 'uploadRequiredWhen' | 'buttons'>,
): boolean {
  if (!Array.isArray(row.buttons) || !row.buttons.length) return false
  return (row.uploadRequiredWhen || 'always') !== 'abnormal'
}

/**
 * 根据检查结果判断本行当前是否要求上传。
 * - no_equipment：一律不要求上传
 * - always：有按钮即要求
 * - abnormal：仅 status===abnormal 时要求
 */
export function isRowUploadRequiredNow(
  row: Pick<GuidanceRowV1, 'uploadRequiredWhen' | 'buttons'>,
  issueStatus?: string | null,
): boolean {
  if (!Array.isArray(row.buttons) || !row.buttons.length) return false
  const status = String(issueStatus || '').trim().toLowerCase()
  if (status === 'no_equipment') return false
  const when = row.uploadRequiredWhen || 'always'
  if (when === 'abnormal') {
    return status === 'abnormal'
  }
  return true
}

export function countTemplatePhotos(rows: GuidanceRowV1[]): number {
  return rows.reduce((n, row) => {
    if (!countsTowardAlwaysRequiredUploads(row)) return n
    return n + (Array.isArray(row.buttons) ? row.buttons.length : 0)
  }, 0)
}

export function buildPhotoCountsByTemplate(doc: GuidanceDocV1 | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  const templates = doc?.templates || {}
  Object.keys(templates).forEach((key) => {
    out[key] = countTemplatePhotos(getTemplateRows(doc, key))
  })
  return out
}

/** 数据同步阶段行（节点扫描 / 日志下载）。 */
export function isGuidanceDataSyncRow(row: Pick<GuidanceRowV1, 'description' | 'seq'>): boolean {
  const desc = String(row.description || '')
  if (/节点扫描|各类日志下载/.test(desc)) return true
  // 兼容旧模板序号
  const seq = String(row.seq || '')
  return seq === '17' || seq.startsWith('17.')
}

const GUIDANCE_INPUT_DISABLED = new Set(['无需该项', '无', '-', 'N/A', 'NA', 'NONE'])

/** 模板字段是否需要前端输入（排除「无需该项」等）。 */
export function isGuidanceInputEnabled(raw: unknown): boolean {
  const v = String(raw || '').trim()
  if (!v) return false
  return !GUIDANCE_INPUT_DISABLED.has(v) && !GUIDANCE_INPUT_DISABLED.has(v.toUpperCase())
}

export type GuidanceEquipmentFieldKey =
  | 'materialNumber'
  | 'serialNumber'
  | 'overhaulOrManufactureDate'

export interface GuidanceEquipmentFlags {
  materialNumber: boolean
  serialNumber: boolean
  overhaulOrManufactureDate: boolean
}

export function getGuidanceEquipmentFlags(
  row: Pick<
    GuidanceRowV1,
    'materialNumberInput' | 'serialNumberInput' | 'overhaulOrManufactureDateInput'
  >,
): GuidanceEquipmentFlags {
  return {
    materialNumber: isGuidanceInputEnabled(row.materialNumberInput),
    serialNumber: isGuidanceInputEnabled(row.serialNumberInput),
    overhaulOrManufactureDate: isGuidanceInputEnabled(row.overhaulOrManufactureDateInput),
  }
}

export function rowNeedsEquipmentInputs(
  row: Pick<
    GuidanceRowV1,
    'materialNumberInput' | 'serialNumberInput' | 'overhaulOrManufactureDateInput'
  >,
): boolean {
  const flags = getGuidanceEquipmentFlags(row)
  return flags.materialNumber || flags.serialNumber || flags.overhaulOrManufactureDate
}
