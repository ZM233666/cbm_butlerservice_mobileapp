<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useI18n } from '@/composables/useI18n'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import TaskUploadSlot from '@/components/task/TaskUploadSlot.vue'
import type { SlotUploadStatus } from '@/components/task/TaskUploadSlot.vue'
import { fetchGuidanceTasks, fetchHomeConfig, fetchTaskStatus, fetchTaskDetail, postTaskStatus, postTaskSubmit, postTaskDraft, postTaskEditRequest, fetchLatestTaskSubmit, type TaskSubmitResponse } from '@/api/tasks'
import { uploadImage } from '@/api/upload'
import type { UploadResult } from '@/api/upload'
import type {
  AbnormalSeverity,
  GuidanceRow,
  InspectionRecord,
  InspectionStatus,
  TaskDetail,
} from '@/types/task'
import {
  ABNORMAL_SEVERITY_OPTIONS,
  normalizeAbnormalSeverity,
  parseSeverityFromResultText,
} from '@/utils/inspectionSeverity'
import { buildIssueSubmitEntry, buildIssuesSubmitMap } from '@/utils/issueSubmitFormat'
import { picSampleUrl, resolvePicSampleFileForRow, rowHasPicSample } from '@/utils/pic-samples'
import { formatMaintLabel, normalizeMaint } from '@/utils/maint'
import {
  type GuidanceDocV1,
  type GuidanceEquipmentFieldKey,
  deriveTrainModelFromTrainNo,
  getGuidanceEquipmentFlags,
  getTemplateRows,
  isGuidanceDataSyncRow,
  isRowUploadRequiredNow,
  rowNeedsEquipmentInputs,
  selectTemplateKey,
} from '@/utils/guidance-template'
import { normalizeMileageKmInput, sanitizeMileageKmDigits } from '@/utils/mileageKm'
import {
  MAX_EXTRA_PHOTOS_PER_SLOT,
  buildCompactUploadSlotMoves,
  buildExtraDisplayName,
  buildExtraUploadSlotId,
  getBaseUploadSlotId,
  groupUploadSlotIds,
  listExtraUploadSlotIds,
  nextExtraUploadIndex,
  resolveUploadDisplayName,
} from '@/utils/uploadSlots'
import * as exifr from 'exifr'

defineOptions({ name: 'TaskListView' })

let guidanceDocMemoryCache: GuidanceDocV1 | null = null

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { lang, t } = useI18n()
const toastStore = useToastStore()

// TODO: 新模板样例图就绪后，按 row.seq / id 重新配置；当前先预留按钮逻辑，不展示
const FALLBACK_UPLOAD_MAX_BYTES = 30 * 1024 * 1024
const LOW_RES_MAX_EDGE = 1000

type ClientCaptureMeta = { capturedAt: string; latitude?: number; longitude?: number; accuracy?: number }

type EquipmentRecord = {
  materialNumber?: string
  serialNumber?: string
  overhaulOrManufactureDate?: string
}

const maintType = ref<string>('c4')
const taskDetail = ref<TaskDetail | null>(null)
const mileageKmInput = ref('')
const guidanceDoc = ref<GuidanceDocV1 | null>(null)
const uploadRecords = ref<Record<string, { url: string; capture?: UploadResult['capture']; displayName?: string }>>({})
const localPreviewRecords = ref<Record<string, string>>({})
const slotUploadStatus = ref<Record<string, SlotUploadStatus>>({})
const issueRecords = ref<Record<string, InspectionRecord>>({})
const equipmentRecords = ref<Record<string, EquipmentRecord>>({})
const uploadMaxBytes = ref(FALLBACK_UPLOAD_MAX_BYTES)
const uploadAllowedContentTypePrefixes = ref(['image/'])

type PreparedUpload = {
  slotId: string
  slotLabel: string
  uploadFile: File
  clientMeta: ClientCaptureMeta
  token: number
  taskId: string
}

type PendingRetrySource = {
  slotId: string
  slotLabel: string
  sourceFile: File
  token: number
  taskId: string
}

type UploadQueueItem = {
  slotId: string
  token: number
  taskId: string
}

const preparedUploads = ref<Record<string, PreparedUpload>>({})
const pendingRetrySources = ref<Record<string, PendingRetrySource>>({})
const addPhotoInputRef = ref<HTMLInputElement | null>(null)
const addPhotoPickerTarget = ref<{ baseSlot: string; baseLabel: string } | null>(null)
const uploadQueue = ref<UploadQueueItem[]>([])
const slotTokens: Record<string, number> = {}
let uploadPumpRunning = false
let uploadPageAlive = true
let hydrateGeneration = 0

const previewOpen = ref(false)
const previewSrc = ref('')
const previewZoom = ref(1)
const previewSlotId = ref('')
const previewBlobUrl = ref('')

const schematicOpen = ref(false)
const schematicSrc = ref('')
const schematicZoom = ref(1)
const schematicPanX = ref(0)
const schematicPanY = ref(0)
const schematicFigRef = ref<HTMLElement | null>(null)
const isSchematicDragging = ref(false)

const MIN_ZOOM = 1
const MAX_ZOOM = 4

type Pt = { x: number; y: number }
const activePointers = new Map<number, Pt>()
let panStartPointer: Pt | null = null
let panStartOffset: Pt = { x: 0, y: 0 }
let pinchStartDistance = 0
let pinchStartZoom = 1

const issueOpen = ref(false)
const issueRowId = ref('')
const issueStatus = ref<InspectionStatus | ''>('')
const issueSeverity = ref<AbnormalSeverity | ''>('')
const issueText = ref('')
const flashingRowId = ref('')
const flashingEquipmentKey = ref('')
/** 当前展开的子任务卡片（空=全部折叠） */
const expandedRowId = ref('')
const mileageFlash = ref(false)
/** 闪红两轮（CSS 0.9s × 2）后再清除 class */
const FLASH_CLEAR_MS = 2000
let flashTimer: ReturnType<typeof setTimeout> | null = null
let mileageFlashTimer: ReturnType<typeof setTimeout> | null = null
const submitConfirmOpen = ref(false)
const abnormalitySummaryOpen = ref(false)
const pendingSubmitAllowEmpty = ref(false)
const submittingTask = ref(false)
const currentTaskStatus = ref<'todo' | 'doing' | 'done' | 'rejected'>('todo')
const editRequestOpen = ref(false)
const editRequestReason = ref('')
const editRequestSubmitting = ref(false)
const savingDraft = ref(false)
const syncingIssueDraft = ref(false)
// taskKey：统一以 Main Task ID 作为唯一 key（来自 query.k / query.taskId）
const taskKey = computed(() => String(route.query.k || route.query.taskId || '').trim())
const fallbackTaskKey = computed(() => {
  const title = String(route.query.title || '').trim()
  const deadline = String(route.query.deadline || '').trim()
  if (!title || !deadline) return ''
  // 与首页 taskKey() 保持一致，maint 统一小写
  return `${maintType.value.toLowerCase()}-${title}-${deadline}`
})

const mainTaskId = computed(() => String(route.query.taskId || '').trim())
const effectiveTaskKey = computed(() => mainTaskId.value || taskKey.value || fallbackTaskKey.value)
const EMPTY_FIELD = '-'

function displayField(value: string | undefined | null) {
  const text = String(value || '').trim()
  return text || EMPTY_FIELD
}

const basicServiceLocation = computed(() => displayField(taskDetail.value?.depot))
const basicTrainNo = computed(() => {
  const fromDetail = String(taskDetail.value?.trainNo || '').trim()
  if (fromDetail) return fromDetail
  return displayField(String(route.query.trainNo || route.query.vehicleNo || '').trim())
})
const basicTrainModel = computed(() => {
  const explicit = String(
    taskDetail.value?.trainModel
      || (taskDetail.value as { vehicleModel?: string } | null)?.vehicleModel
      || route.query.trainModel
      || route.query.model
      || '',
  ).trim()
  if (explicit) return explicit.toUpperCase()
  const token = deriveTrainModelFromTrainNo(basicTrainNo.value === EMPTY_FIELD ? '' : basicTrainNo.value)
  return displayField(token)
})
const trainNoForTemplate = computed(() => {
  // 模板选择优先用完整车号（可识别 FXD1B 等 8 轴型号）
  const fromDetail = String(taskDetail.value?.trainNo || '').trim()
  if (fromDetail) return fromDetail
  const fromQuery = String(route.query.trainNo || route.query.vehicleNo || '').trim()
  if (fromQuery) return fromQuery
  return String(
    taskDetail.value?.trainModel
      || (taskDetail.value as { vehicleModel?: string } | null)?.vehicleModel
      || route.query.trainModel
      || '',
  ).trim()
})
const basicEmployeeId = computed(() => displayField(taskDetail.value?.employeeId || auth.user?.employeeId))
const basicMaintLabel = computed(() =>
  formatMaintLabel(taskDetail.value?.maint || maintType.value),
)

const guidanceTemplateKey = computed(() =>
  selectTemplateKey(trainNoForTemplate.value, maintType.value, guidanceDoc.value?.templateSelection),
)
const guidanceRows = computed<GuidanceRow[]>(() =>
  getTemplateRows(guidanceDoc.value, guidanceTemplateKey.value) as GuidanceRow[],
)
const basicTaskId = computed(() => displayField(taskDetail.value?.taskId || mainTaskId.value))
const basicDeadline = computed(() => displayField(taskDetail.value?.deadline || String(route.query.deadline || '')))

function applyMileageFromDetail(task: TaskDetail | null | undefined) {
  if (task?.mileageKm != null && Number.isFinite(Number(task.mileageKm))) {
    mileageKmInput.value = String(Math.trunc(Number(task.mileageKm)))
  }
}

const homeRefreshStamp = ref(0)
const backToHome = computed(() => {
  if (!homeRefreshStamp.value) return '/'
  return { path: '/', query: { refresh: String(homeRefreshStamp.value) } }
})

const visibleRows = computed(() =>
  guidanceRows.value.map((row) => ({
    ...row,
    displaySeq: row.seq,
  })),
)

const EN_DESC: Record<string, string> = {
  r1: 'Locomotive number photo: take a photo and upload it to the system attachment.',
  r2: 'BCM nameplate: take a photo and upload it to the system attachment.',
  r3: 'IPM part number / serial number photo: take a photo and upload it to the system attachment. Note: the IPM SN here is the Westinghouse serial number (not KB SN).',
  'r3-1': 'For the first Digital CBM service after C4/C5/C6 returning to depot, visually inspect all pins inside all IPM sockets and upload photos to the system attachment. Also confirm whether J7/J8 has been tightened by the customer.',
  'r3-2': 'For the first Digital CBM service after C4/C5/C6 returning to depot, visually inspect connector J6 and upload a photo to the system attachment (named as IPM J6C to distinguish from IPM J6 photos).',
  'r3-3': 'After the inspection, restore connectors J1/J4/J5/J6 to normal state, take photos, and upload to the system attachment. Note: the locating pin of the aviation connector must be clearly visible.',
  'r3-4': 'For C1/C2/C3 inspections, also check the tightening status of the above connectors (photos can be saved locally).',
  r4: 'BCM appearance: check whether the bolts of the BCM HARTING SOCKET are tightened and upload a photo to the system attachment. Note: also check the 3 bolts at the bottom by hand for looseness.',
  r5: 'LRU aviation connectors: check whether connector locks on each LRU of EPCU are fully tightened. Gently rotate counterclockwise to verify resistance. If loose, open and inspect; the O-ring may be missing and should be replaced in time (PN: 779390). If O-ring exists but connector is still loose, record it in Digital CBM and contact customer for handling. If some customers have wrapped with insulation tape, record it and confirm connector is tightened. Take a photo of J103 and upload to the system attachment. Note: the locating pin of the aviation connector must be clearly visible.',
  'r5-1': 'For the first Digital CBM service after C4/C5/C6 returning to depot, inspect all internal pins of PSJB connectors (multiple C6 cases had tilted pins causing failures, and EBVA/B connectors not fully locked with dropout risk), take photos, and upload to the system attachment. After inspection, ensure all plugs and sockets are properly tightened.',
  r6: 'RIM / E-BOX: inspect RIM / E-Box units and take photos of nameplate information for system attachment.',
  'r6-1': 'E-Box relays: carefully check whether relay bases are secured, relay-to-base connection is normal, and wires are properly seated in terminal slots. Check whether J4/jumpers are aged; for some models relay seat jumpers may need project replacement. Also check for potential wire chafing risk in RIM terminal blocks. Take photos of all relay states and terminal blocks, then upload to the system attachment.',
  r7: 'HDLC: check whether the connector lock between junction box sockets and cable-head aviation plugs is in place. Take photos and upload to the system attachment. Note: the locating pin of the aviation connector must be clearly visible.',
  r8: 'EBV: for the first Digital CBM service after C4/C5/C6 returning to depot, confirm grounding wire status, inspect internal pin condition of EBVA/B sockets, take photos, and upload to the system attachment.',
  'r8-1': 'Check accurate positioning of all EBV big/small brake handle positions and ensure no excessive resistance during movement; verify EBV aviation connector lock is in place. Take photos and upload to the system attachment. Note: the locating pin of the aviation connector must be clearly visible.',
  'r8-2': 'Check EBV valve 21 related pipeline connections and NB11 related pipeline connections (for C1-C3, check status only; for C4-C6, take photos and upload to the system attachment).',
  r9: 'LCDM: for the first Digital CBM service after C4/C5/C6 returning to depot, check whether communication and power cables are locked in place and record LCDM serial numbers. Note: the locating pin of the aviation connector must be clearly visible.',
  'r9-1': 'Check LCDM appearance for no damage, normal screen display (no blur/white/black screen or bright lines), and normal button functions. Confirm LCDM software version: freight locomotive 4.19; 160 km model 1.4. Take photos and upload to the system attachment.',
  r10: 'EPCU nodes: scan nodes via PTU, take screenshots, and upload to the system attachment.',
  r11: 'WSP: confirm MB04B LED status shows "9999", take a photo, and upload to the system attachment.',
  'r11-1': 'For the first Digital CBM service after C4/C5/C6 returning to depot, run self-test and take photos of WSP cabinet serial number for system attachment.',
  r12: 'EPCU main air filter element: check whether drainage works normally (previous cases found severe module oil contamination due to long-term no drainage). Take photos and upload to the system attachment.',
  r13: 'Uncoupling protection switch: check whether connector is properly tightened and confirm no leakage on mounting surface. Take photos and upload to the system attachment.',
  r14: 'U99: for the first Digital CBM service after C4/C5/C6 returning to depot, check whether U99 connector is tightened. Take photos and upload to the system attachment.',
  r15: 'Auxiliary modules: check connector status of all auxiliary module switches, take photos, and upload to the system attachment.',
  r16: 'Post brake-system startup check: verify indicator status of IPM and EPCU is normal; cab change and operation mode switching functions are normal. Note: under normal conditions, system startup is completed within 2 minutes.',
  r17: 'Upload EVENT LOGS and corresponding images to FSM system attachments. See details below.',
  'r17-1': 'Compress all downloaded logs including EAB, EPCU, and EBV into one archive. Naming example: LocomotiveNo_EVENTLOGS_Date (e.g., HXD3D8026_EVENTLOGS_20250918).',
  'r17-2': 'Open SAP FSM Windows version on PC and locate the corresponding Assignment under the Service Call.',
  'r17-3': 'Inside the Assignment, click "Attach new file" / "Pick file from the library".',
  'r17-4': 'In the popup, locate the folder with saved files, select all files to upload, then click Open/Save.',
  'r17-5': 'Check and confirm that all required files/images/logs have been uploaded.',
  'r17-6': 'Click the sync button in the top-right corner to complete server data synchronization.',
}

const rowDescription = computed(() => {
  if (lang.value !== 'en') return (row: GuidanceRow) => row.description
  return (row: GuidanceRow) => EN_DESC[row.id] || row.description
})

function isDataSyncRow(row: GuidanceRow) {
  return isGuidanceDataSyncRow(row)
}

function equipmentFlagsOf(row: GuidanceRow) {
  return getGuidanceEquipmentFlags(row)
}

function equipmentValue(rowId: string, key: GuidanceEquipmentFieldKey): string {
  return String(equipmentRecords.value[rowId]?.[key] || '')
}

/** 大修/维修日期：存 yyyy-mm-dd；兼容历史非日期文案 */
function isIsoDateValue(raw: string): boolean {
  const text = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [y, m, d] = text.split('-').map((x) => Number(x))
  if (!y || !m || !d) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const equipmentDateMin = '1990-01-01'
const equipmentDateMax = computed(() => todayIsoDate())

function equipmentDateInputValue(rowId: string): string {
  const v = equipmentValue(rowId, 'overhaulOrManufactureDate').trim()
  return isIsoDateValue(v) ? v : ''
}

function equipmentLegacyDateHint(rowId: string): string {
  const v = equipmentValue(rowId, 'overhaulOrManufactureDate').trim()
  if (!v || isIsoDateValue(v)) return ''
  return lang.value === 'zh'
    ? `原填写：${v}（请点日历重新选择日期）`
    : `Previous: ${v} (tap calendar to set a date)`
}

function openEquipmentDatePicker(ev: Event) {
  if (!canEditWork.value) return
  const root = (ev.currentTarget as HTMLElement | null)?.closest('.tl-equipment-field__control')
  const input = root?.querySelector('input[type="date"]') as HTMLInputElement | null
  if (!input || input.disabled || input.readOnly) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    /* fall through */
  }
  input.focus()
  input.click()
}

function setEquipmentValue(rowId: string, key: GuidanceEquipmentFieldKey, raw: string) {
  let value = String(raw || '')
  if (key === 'overhaulOrManufactureDate') {
    value = value.trim()
    // 仅接受 yyyy-mm-dd；清空允许
    if (value && !isIsoDateValue(value)) return
  }
  const prev = equipmentRecords.value[rowId] || {}
  const draft: EquipmentRecord = { ...prev, [key]: value }
  const cleaned: EquipmentRecord = {}
  const mat = String(draft.materialNumber ?? '')
  const ser = String(draft.serialNumber ?? '')
  const date = String(draft.overhaulOrManufactureDate ?? '')
  if (mat.trim()) cleaned.materialNumber = mat
  if (ser.trim()) cleaned.serialNumber = ser
  if (date.trim()) cleaned.overhaulOrManufactureDate = date.trim()
  const map = { ...equipmentRecords.value }
  if (Object.keys(cleaned).length) map[rowId] = cleaned
  else delete map[rowId]
  equipmentRecords.value = map
}

function normalizeEquipmentRecord(raw: unknown): EquipmentRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const src = raw as Record<string, unknown>
  const materialNumber = String(src.materialNumber ?? src.material_number ?? '').trim()
  const serialNumber = String(src.serialNumber ?? src.serial_number ?? '').trim()
  const overhaulOrManufactureDate = String(
    src.overhaulOrManufactureDate
      ?? src.overhaul_or_manufacture_date
      ?? src.overhaulDate
      ?? src.manufactureDate
      ?? '',
  ).trim()
  if (!materialNumber && !serialNumber && !overhaulOrManufactureDate) return null
  const out: EquipmentRecord = {}
  if (materialNumber) out.materialNumber = materialNumber
  if (serialNumber) out.serialNumber = serialNumber
  if (overhaulOrManufactureDate) out.overhaulOrManufactureDate = overhaulOrManufactureDate
  return out
}

function buildEquipmentSubmitMap(records: Record<string, EquipmentRecord>) {
  const out: Record<string, EquipmentRecord> = {}
  Object.entries(records || {}).forEach(([rowId, item]) => {
    const key = String(rowId || '').trim()
    const rec = normalizeEquipmentRecord(item)
    if (!key || !rec) return
    out[key] = rec
  })
  return out
}

function equipmentFieldLabel(key: GuidanceEquipmentFieldKey): string {
  if (lang.value === 'zh') {
    if (key === 'materialNumber') return '物料号'
    if (key === 'serialNumber') return '序列号'
    return '大修/维修日期'
  }
  if (key === 'materialNumber') return 'Material No.'
  if (key === 'serialNumber') return 'Serial No.'
  return 'Overhaul / Mfr. Date'
}

/** 输入框 placeholder：去掉中英文括号说明 */
function inputPlaceholder(raw: unknown): string {
  return String(raw || '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
}

function isDataSyncStart(index: number) {
  const row = visibleRows.value[index]
  if (!row || !isDataSyncRow(row)) return false
  if (index === 0) return true
  return !isDataSyncRow(visibleRows.value[index - 1])
}

function rowIssueStatus(rowId: string): InspectionStatus | '' {
  return normalizeIssueRecord(issueRecords.value[rowId])?.status || ''
}

/** 卡片标题基底：取说明首行，去掉末尾冒号 */
function rowCardTitleBase(row: GuidanceRow): string {
  const desc = String(rowDescription.value(row) || '').trim()
  const firstLine = (desc.split(/\r?\n/)[0] || '').trim()
  const title = firstLine.replace(/[：:]\s*$/, '').trim()
  return title || String(row.seq || row.id || '')
}

/** 同名标题加 1/2/3 后缀，便于收起态区分 */
const rowCardDisplayTitles = computed(() => {
  const rows = visibleRows.value
  const bases = rows.map((row) => ({ id: row.id, base: rowCardTitleBase(row) }))
  const counts = new Map<string, number>()
  bases.forEach((item) => {
    counts.set(item.base, (counts.get(item.base) || 0) + 1)
  })
  const seen = new Map<string, number>()
  const out: Record<string, string> = {}
  bases.forEach((item) => {
    const total = counts.get(item.base) || 0
    if (total <= 1) {
      out[item.id] = item.base
      return
    }
    const n = (seen.get(item.base) || 0) + 1
    seen.set(item.base, n)
    out[item.id] = `${item.base}${n}`
  })
  return out
})

function rowCardTitle(row: GuidanceRow): string {
  return rowCardDisplayTitles.value[row.id] || rowCardTitleBase(row)
}

function rowUploadStats(row: GuidanceRow): { uploaded: number; required: number } {
  const buttons = row.buttons || []
  let uploaded = 0
  const required = buttons.length
  for (const btn of buttons) {
    if (displayedUploadUrl(btn.slot)) uploaded += 1
    for (const extraId of extraSlotsForBase(btn.slot)) {
      if (displayedUploadUrl(extraId)) uploaded += 1
    }
  }
  return { uploaded, required }
}

function isRowWorkComplete(row: GuidanceRow): boolean {
  if (!isIssueComplete(issueRecords.value[row.id])) return false
  if (missingEquipmentFieldsOf(row).length > 0) return false
  const status = rowIssueStatus(row.id)
  if (status === 'no_equipment') return true
  if (!isRowUploadRequiredNow(row, status)) return true
  const buttons = row.buttons || []
  if (!buttons.length) return true
  return buttons.every((b) => !!uploadRecords.value[b.slot]?.url)
}

function rowHasAnyProgress(row: GuidanceRow): boolean {
  if (normalizeIssueRecord(issueRecords.value[row.id])) return true
  const equip = equipmentRecords.value[row.id]
  if (equip && Object.values(equip).some((v) => String(v || '').trim())) return true
  const buttons = row.buttons || []
  return buttons.some((b) => {
    if (displayedUploadUrl(b.slot)) return true
    return extraSlotsForBase(b.slot).some((id) => !!displayedUploadUrl(id))
  })
}

type SubtaskWorkStatus = 'done' | 'doing' | 'todo'

function rowWorkStatus(row: GuidanceRow): SubtaskWorkStatus {
  if (isRowWorkComplete(row)) return 'done'
  if (rowHasAnyProgress(row) || expandedRowId.value === row.id) return 'doing'
  return 'todo'
}

function rowWorkStatusLabel(status: SubtaskWorkStatus): string {
  if (lang.value === 'zh') {
    if (status === 'done') return '已完成'
    if (status === 'doing') return '进行中'
    return '未开始'
  }
  if (status === 'done') return 'Done'
  if (status === 'doing') return 'In progress'
  return 'Not started'
}

/** 收起态主状态：完成后展示检查结果文案，否则展示作业进度 */
function rowCollapsedStatusLabel(row: GuidanceRow): string {
  if (rowWorkStatus(row) === 'done') {
    return rowCollapsedIssueLabel(row) || rowWorkStatusLabel('done')
  }
  return rowWorkStatusLabel(rowWorkStatus(row))
}

/** 收起态主状态样式：完成后与检查结果按钮配色同步 */
function rowCollapsedStatusClass(row: GuidanceRow): Record<string, boolean> {
  const work = rowWorkStatus(row)
  if (work === 'done') {
    const issue = issueBtnClass(row.id)
    return {
      'is-done': true,
      'is-issue': true,
      'is-ok': !!issue['is-ok'],
      'is-abnormal': !!issue['is-abnormal'],
      'is-abnormal-minor': !!issue['is-abnormal-minor'],
      'is-abnormal-moderate': !!issue['is-abnormal-moderate'],
      'is-abnormal-severe': !!issue['is-abnormal-severe'],
      'is-undetectable': !!issue['is-undetectable'],
      'is-no-equipment': !!issue['is-no-equipment'],
    }
  }
  return {
    'is-doing': work === 'doing',
    'is-todo': work === 'todo',
  }
}

function rowSeqClass(row: GuidanceRow): Record<string, boolean> {
  const work = rowWorkStatus(row)
  if (work === 'done') {
    const issue = issueBtnClass(row.id)
    return {
      'is-done': true,
      'is-ok': !!issue['is-ok'],
      'is-abnormal': !!issue['is-abnormal'],
      'is-abnormal-minor': !!issue['is-abnormal-minor'],
      'is-abnormal-moderate': !!issue['is-abnormal-moderate'],
      'is-abnormal-severe': !!issue['is-abnormal-severe'],
      'is-undetectable': !!issue['is-undetectable'],
      'is-no-equipment': !!issue['is-no-equipment'],
    }
  }
  return {
    'is-doing': work === 'doing',
  }
}

function rowCollapsedMeta(row: GuidanceRow): string {
  const buttons = row.buttons || []
  const stats = rowUploadStats(row)
  const labels = buttons.map((b) => String(b.label || '').trim()).filter(Boolean)
  const naming = String(row.imageNaming || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const head = (labels.length ? labels.join('/') : naming.join('/')).trim()

  if (!buttons.length) {
    return String(row.uploadHint || (lang.value === 'zh' ? '无需拍照' : 'No photo required'))
  }
  const uploadedText = lang.value === 'zh'
    ? `已上传${stats.uploaded}张`
    : `${stats.uploaded} uploaded`
  return head ? `${head} · ${uploadedText}` : uploadedText
}

/** 卡片内「添加照片」：优先挂到仍可追加的主槽 */
function rowAddExtraTarget(row: GuidanceRow): { baseSlot: string; baseLabel: string } | null {
  for (const btn of row.buttons || []) {
    if (canAddExtraPhoto(btn.slot)) {
      return { baseSlot: btn.slot, baseLabel: btn.label }
    }
  }
  return null
}

function onRowAddExtraPhoto(row: GuidanceRow) {
  const target = rowAddExtraTarget(row)
  if (!target) return
  onAddExtraPhoto(target.baseSlot, target.baseLabel)
}

/** 收起态右侧：检查已完成时展示检查结果短标签 */
function rowCollapsedIssueLabel(row: GuidanceRow): string {
  const rec = normalizeIssueRecord(issueRecords.value[row.id])
  if (!isIssueComplete(rec) || !rec) return ''
  const label = inspectionStatusLabel(rec.status)
  if (rec.status === 'abnormal') {
    const sev = abnormalSeverityLabel(rec.severity)
    return sev ? `${label}·${sev}` : label
  }
  return label
}

const subtaskProgress = computed(() => {
  const rows = visibleRows.value
  const total = rows.length
  const completed = rows.filter((row) => isRowWorkComplete(row)).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { completed, total, percent }
})

const subtaskProgressText = computed(() => {
  const { completed, total } = subtaskProgress.value
  return lang.value === 'zh'
    ? `${completed}/${total} 已完成`
    : `${completed}/${total} done`
})

function isSubtaskExpanded(rowId: string) {
  return expandedRowId.value === rowId
}

function toggleSubtaskCard(rowId: string) {
  expandedRowId.value = expandedRowId.value === rowId ? '' : rowId
}

function expandSubtaskCard(rowId: string) {
  expandedRowId.value = rowId
}

/** 异常条件必传且缺失照片的行（硬拦截，不允许「仍然提交」绕过）。 */
const hardIncompleteUploadRows = computed(() =>
  visibleRows.value.filter((row) => {
    if (!isRowUploadRequiredNow(row, rowIssueStatus(row.id))) return false
    if ((row.uploadRequiredWhen || 'always') !== 'abnormal') return false
    const buttons = row.buttons || []
    return buttons.some((b) => !uploadRecords.value[b.slot]?.url)
  }),
)

/** 普通必传缺失（可弹窗确认后仍提交）。无此设备不计入。 */
const incompleteRows = computed(() =>
  visibleRows.value.filter((row) => {
    if ((row.uploadRequiredWhen || 'always') === 'abnormal') return false
    if (!isRowUploadRequiredNow(row, rowIssueStatus(row.id))) return false
    const buttons = row.buttons || []
    if (!buttons.length) return false
    return buttons.some((b) => !uploadRecords.value[b.slot]?.url)
  }),
)

const isSubmitReady = computed(
  () => hardIncompleteUploadRows.value.length === 0 && incompleteRows.value.length === 0,
)

function focusFirstHardIncompleteUpload() {
  const first = hardIncompleteUploadRows.value[0]
  if (!first) return
  flashRowById(first.id)
}

const INSPECTION_STATUSES: InspectionStatus[] = ['ok', 'abnormal', 'no_equipment']

function normalizeIssueRecord(raw: unknown): InspectionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as { status?: string; text?: string; updatedAt?: string; severity?: string; result?: string }
  const text = String(item.text || '').trim()
  const statusRaw = String(item.status || '').trim().toLowerCase()
  let status = (statusRaw === 'normal' ? 'ok' : statusRaw) as InspectionStatus | 'undetectable' | ''
  let severity = normalizeAbnormalSeverity(item.severity)
  // 历史：顶层「无法检测」→ 发现异常 + 等级无法检查
  if (status === 'undetectable') {
    status = 'abnormal'
    if (!severity) severity = 'undetectable'
  }
  if (!severity && status === 'abnormal') {
    severity = parseSeverityFromResultText(item.result)
  }
  if (INSPECTION_STATUSES.includes(status as InspectionStatus)) {
    return {
      status: status as InspectionStatus,
      text,
      updatedAt: String(item.updatedAt || ''),
      ...(status === 'abnormal' && severity ? { severity } : {}),
    }
  }
  if (text) {
    return {
      status: 'abnormal',
      text,
      updatedAt: String(item.updatedAt || ''),
      ...(severity ? { severity } : {}),
    }
  }
  return null
}

function isIssueComplete(raw: unknown): boolean {
  const rec = normalizeIssueRecord(raw)
  if (!rec) return false
  if (rec.status === 'ok' || rec.status === 'no_equipment') return true
  if (rec.status === 'abnormal') {
    return !!rec.severity && rec.text.trim().length > 0
  }
  return false
}

function abnormalSeverityLabel(severity: AbnormalSeverity | '' | undefined) {
  if (severity === 'severe') return t.value.issueSeveritySevere
  if (severity === 'moderate') return t.value.issueSeverityModerate
  if (severity === 'minor') return t.value.issueSeverityMinor
  if (severity === 'undetectable') return t.value.issueSeverityUndetectable
  return ''
}

function issueBtnClass(rowId: string) {
  const rec = normalizeIssueRecord(issueRecords.value[rowId])
  if (!isIssueComplete(rec)) return {}
  const severity = rec?.status === 'abnormal' ? normalizeAbnormalSeverity(rec.severity) : ''
  return {
    'is-filled': true,
    'is-ok': rec?.status === 'ok',
    'is-abnormal': rec?.status === 'abnormal' && severity !== 'undetectable',
    'is-abnormal-minor': severity === 'minor',
    'is-abnormal-moderate': severity === 'moderate',
    'is-abnormal-severe': severity === 'severe',
    'is-undetectable': rec?.status === 'abnormal' && severity === 'undetectable',
    'is-no-equipment': rec?.status === 'no_equipment',
  }
}

function inspectionStatusLabel(status: InspectionStatus | '' | undefined) {
  if (status === 'ok') return t.value.issueStatusOk
  if (status === 'abnormal') return t.value.issueStatusAbnormal
  if (status === 'no_equipment') return t.value.issueStatusNoEquipment
  return ''
}

function issueNoteDisplay(rowId: string) {
  const rec = normalizeIssueRecord(issueRecords.value[rowId])
  if (!rec) return ''
  const label = inspectionStatusLabel(rec.status)
  if (rec.status === 'ok' || rec.status === 'no_equipment') return label
  if (rec.status === 'abnormal') {
    const sev = abnormalSeverityLabel(rec.severity)
    const head = sev ? `${label}（${sev}）` : label
    if (!rec.text) return head
    return `${head}：${rec.text}`
  }
  return label
}

function issueNotePreview(rowId: string) {
  const text = issueNoteDisplay(rowId)
  if (!text) return ''
  return text.length > 44 ? `${text.slice(0, 44)}...` : text
}

const issueAbnormalFields = computed(() => issueStatus.value === 'abnormal')
const issueDetailRequired = computed(() => issueAbnormalFields.value)
const issuePlaceholderText = computed(() => {
  if (issueStatus.value === 'abnormal') {
    if (issueSeverity.value === 'undetectable') return t.value.issuePlaceholderUndetectable
    return t.value.issuePlaceholderAbnormal
  }
  return t.value.issuePlaceholder
})

const incompleteInspectionRows = computed(() =>
  visibleRows.value.filter((row) => !isIssueComplete(issueRecords.value[row.id])),
)

function missingEquipmentFieldsOf(row: GuidanceRow): GuidanceEquipmentFieldKey[] {
  if (!rowNeedsEquipmentInputs(row)) return []
  // 「无此设备」时不要求填写物料信息
  if (rowIssueStatus(row.id) === 'no_equipment') return []
  const flags = equipmentFlagsOf(row)
  const missing: GuidanceEquipmentFieldKey[] = []
  if (flags.materialNumber && !equipmentValue(row.id, 'materialNumber').trim()) {
    missing.push('materialNumber')
  }
  if (flags.serialNumber && !equipmentValue(row.id, 'serialNumber').trim()) {
    missing.push('serialNumber')
  }
  if (flags.overhaulOrManufactureDate && !equipmentValue(row.id, 'overhaulOrManufactureDate').trim()) {
    missing.push('overhaulOrManufactureDate')
  }
  return missing
}

const incompleteEquipmentRows = computed(() =>
  visibleRows.value.filter((row) => missingEquipmentFieldsOf(row).length > 0),
)

function flashRowById(rowId: string) {
  expandSubtaskCard(rowId)
  flashingRowId.value = rowId
  void nextTick(() => {
    const el = document.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    if (flashingRowId.value === rowId) flashingRowId.value = ''
    if (flashingEquipmentKey.value.startsWith(`${rowId}:`)) flashingEquipmentKey.value = ''
    flashTimer = null
  }, FLASH_CLEAR_MS)
}

function focusFirstIncompleteInspection() {
  const first = incompleteInspectionRows.value[0]
  if (!first) return
  flashingEquipmentKey.value = ''
  flashRowById(first.id)
}

function focusFirstIncompleteEquipment() {
  const first = incompleteEquipmentRows.value[0]
  if (!first) return
  const missing = missingEquipmentFieldsOf(first)
  const field = missing[0]
  flashingEquipmentKey.value = field ? `${first.id}:${field}` : ''
  flashRowById(first.id)
  if (field) {
    void nextTick(() => {
      const key = `${first.id}:${field}`
      const el = document.querySelector(
        `[data-equipment-field="${CSS.escape(key)}"] input`,
      ) as HTMLInputElement | null
      el?.focus({ preventScroll: true })
    })
  }
}

type AbnormalitySummaryItem = { seq: string; text: string }

const abnormalitySummaryGroups = computed(() => {
  const severe: AbnormalitySummaryItem[] = []
  const moderate: AbnormalitySummaryItem[] = []
  const minor: AbnormalitySummaryItem[] = []
  visibleRows.value.forEach((row) => {
    const rec = normalizeIssueRecord(issueRecords.value[row.id])
    if (!rec || rec.status !== 'abnormal') return
    const severity = normalizeAbnormalSeverity(rec.severity)
    // 无法检查、无此设备不汇总；无等级也不汇总
    if (!severity || severity === 'undetectable') return
    const text = String(rec.text || '').trim()
    const item = {
      seq: String(row.displaySeq || row.seq || '').trim() || '-',
      text: text || (lang.value === 'zh' ? '（无描述）' : '(no detail)'),
    }
    if (severity === 'severe') severe.push(item)
    else if (severity === 'moderate') moderate.push(item)
    else if (severity === 'minor') minor.push(item)
  })
  return { severe, moderate, minor }
})

const abnormalitySummaryTotal = computed(
  () =>
    abnormalitySummaryGroups.value.severe.length
    + abnormalitySummaryGroups.value.moderate.length
    + abnormalitySummaryGroups.value.minor.length,
)

function formatAbnormalityGroupLine(
  label: string,
  items: AbnormalitySummaryItem[],
): string {
  if (lang.value === 'zh') {
    if (!items.length) return `${label}异常0处。`
    const parts = items.map((it) => `第${it.seq}步：${it.text}`).join('；')
    return `${label}异常${items.length}处，分别为：${parts}。`
  }
  if (!items.length) return `${label}: 0.`
  const parts = items.map((it) => `Step ${it.seq}: ${it.text}`).join('; ')
  return `${label}: ${items.length} — ${parts}.`
}

const abnormalitySummaryLines = computed(() => {
  const groups = abnormalitySummaryGroups.value
  const total = abnormalitySummaryTotal.value
  if (lang.value === 'zh') {
    if (!total) return [t.value.abnormalitySummaryEmpty]
    return [
      `本次管家式服务共发现${total}处异常，其中：`,
      formatAbnormalityGroupLine('高风险', groups.severe),
      formatAbnormalityGroupLine('中风险', groups.moderate),
      formatAbnormalityGroupLine('低风险', groups.minor),
    ]
  }
  if (!total) return [t.value.abnormalitySummaryEmpty]
  return [
    `This butler service found ${total} abnormalities:`,
    formatAbnormalityGroupLine('High risk', groups.severe),
    formatAbnormalityGroupLine('Medium risk', groups.moderate),
    formatAbnormalityGroupLine('Low risk', groups.minor),
  ]
})
const isViewOnly = computed(() => {
  const raw = String(route.query.readonly || route.query.mode || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'view'
})
const isTaskDone = computed(() => currentTaskStatus.value === 'done')
const isTaskTodo = computed(() => currentTaskStatus.value === 'todo')
const isTaskDoing = computed(() => currentTaskStatus.value === 'doing')
const canEditWork = computed(() => isTaskDoing.value && !isViewOnly.value)

function focusMileageField() {
  mileageFlash.value = true
  void nextTick(() => {
    const el = document.querySelector('[data-mileage-field]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = el?.querySelector('input') as HTMLInputElement | null
    input?.focus({ preventScroll: true })
  })
  if (mileageFlashTimer) clearTimeout(mileageFlashTimer)
  mileageFlashTimer = setTimeout(() => {
    mileageFlash.value = false
    mileageFlashTimer = null
  }, FLASH_CLEAR_MS)
}

function validateMileageForWork({ required = false }: { required?: boolean } = {}): boolean {
  if (!canEditWork.value) return true
  const n = normalizeMileageKmInput(mileageKmInput.value)
  if (n != null) return true
  if (!String(mileageKmInput.value || '').trim()) {
    if (required) {
      toast(t.value.mileageRequired, 'warn')
      focusMileageField()
    }
    return !required
  }
  toast(t.value.mileageInvalid, 'warn')
  focusMileageField()
  return false
}

function onMileageKmInput(event: Event) {
  const el = event.target as HTMLInputElement
  const next = sanitizeMileageKmDigits(el.value)
  if (el.value !== next) el.value = next
  mileageKmInput.value = next
}
const isTaskRejected = computed(() => currentTaskStatus.value === 'rejected')
const editRequestBtnText = computed(() => {
  const dict = t.value as Record<string, string>
  return dict.editRequestBtn || (lang.value === 'zh' ? '编辑申请' : 'Edit Request')
})
const editRequestSentText = computed(() => {
  const dict = t.value as Record<string, string>
  return dict.editRequestSent || (lang.value === 'zh' ? '编辑申请已提交' : 'Edit request submitted')
})

function toast(msg: string, type: Parameters<typeof toastStore.show>[1] = 'info', duration = 2200) {
  toastStore.show(msg, type, duration)
}

function formatUploadLimit(bytes: number) {
  const mb = bytes / 1024 / 1024
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1)
}

function uploadTooLargeMessage() {
  const mb = formatUploadLimit(uploadMaxBytes.value)
  return lang.value === 'zh' ? `图片不能超过 ${mb}MB` : `Image must be ${mb}MB or smaller`
}

function invalidUploadTypeMessage() {
  return lang.value === 'zh' ? '只能上传图片文件' : 'Only image files can be uploaded'
}

function normalizeUploadMaxBytes(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : FALLBACK_UPLOAD_MAX_BYTES
}

function normalizeContentTypePrefixes(value: unknown) {
  if (!Array.isArray(value)) return ['image/']
  const prefixes = value.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
  return prefixes.length ? prefixes : ['image/']
}

function applyUploadConfig(upload?: { maxBytes?: number; allowedContentTypePrefixes?: string[] }) {
  uploadMaxBytes.value = normalizeUploadMaxBytes(upload?.maxBytes)
  uploadAllowedContentTypePrefixes.value = normalizeContentTypePrefixes(upload?.allowedContentTypePrefixes)
}

function isAllowedUploadType(file: File) {
  const contentType = String(file.type || '').trim().toLowerCase()
  if (!contentType) return false
  return uploadAllowedContentTypePrefixes.value.some((prefix) => contentType.startsWith(prefix))
}

async function loadUploadConfig(employeeId: string) {
  try {
    const cfg = await fetchHomeConfig(employeeId)
    applyUploadConfig(cfg.upload)
  } catch {
    applyUploadConfig()
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

function clampZoom(v: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))
}

function maxPanX() {
  const w = schematicFigRef.value?.clientWidth || 0
  return Math.max(0, ((schematicZoom.value - 1) * w) / 2)
}

function maxPanY() {
  const h = schematicFigRef.value?.clientHeight || 0
  return Math.max(0, ((schematicZoom.value - 1) * h) / 2)
}

function clampPan() {
  const mx = maxPanX()
  const my = maxPanY()
  schematicPanX.value = Math.min(mx, Math.max(-mx, schematicPanX.value))
  schematicPanY.value = Math.min(my, Math.max(-my, schematicPanY.value))
}

function setSchematicZoom(nextZoom: number) {
  schematicZoom.value = clampZoom(nextZoom)
  if (schematicZoom.value <= 1) {
    schematicPanX.value = 0
    schematicPanY.value = 0
  } else {
    clampPan()
  }
}

function resetSchematicView() {
  schematicZoom.value = 1
  schematicPanX.value = 0
  schematicPanY.value = 0
  activePointers.clear()
  panStartPointer = null
  pinchStartDistance = 0
  pinchStartZoom = 1
  isSchematicDragging.value = false
}

function zoomBy(delta: number) {
  setSchematicZoom(schematicZoom.value + delta)
}

function distance(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function firstPointer(): Pt | null {
  for (const p of activePointers.values()) return p
  return null
}

function onSchematicPointerDown(e: PointerEvent) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (e.pointerType === 'touch') e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)

  if (activePointers.size === 1) {
    panStartPointer = { x: e.clientX, y: e.clientY }
    panStartOffset = { x: schematicPanX.value, y: schematicPanY.value }
  } else if (activePointers.size === 2) {
    const [a, b] = Array.from(activePointers.values())
    pinchStartDistance = distance(a, b)
    pinchStartZoom = schematicZoom.value
    isSchematicDragging.value = false
  }
}

function onSchematicPointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (e.pointerType === 'touch') e.preventDefault()

  if (activePointers.size >= 2) {
    const [a, b] = Array.from(activePointers.values())
    const d = distance(a, b)
    if (pinchStartDistance > 0) {
      setSchematicZoom(pinchStartZoom * (d / pinchStartDistance))
    }
    return
  }

  if (activePointers.size === 1 && panStartPointer && schematicZoom.value > 1) {
    const dx = e.clientX - panStartPointer.x
    const dy = e.clientY - panStartPointer.y
    schematicPanX.value = panStartOffset.x + dx
    schematicPanY.value = panStartOffset.y + dy
    clampPan()
    isSchematicDragging.value = true
  }
}

function onSchematicPointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId)
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)

  if (activePointers.size === 1) {
    const p = firstPointer()
    if (p) {
      panStartPointer = { ...p }
      panStartOffset = { x: schematicPanX.value, y: schematicPanY.value }
    }
  } else {
    panStartPointer = null
    isSchematicDragging.value = false
  }
}

const schematicImageStyle = computed(() => ({
  transform: `translate(${schematicPanX.value}px, ${schematicPanY.value}px) scale(${schematicZoom.value})`,
}))

function openSchematicForRow(row: GuidanceRow) {
  const file = resolvePicSampleFileForRow(row)
  const url = picSampleUrl(file)
  if (!url) return
  schematicSrc.value = url
  resetSchematicView()
  schematicOpen.value = true
}

const issueTargetRow = computed(() =>
  visibleRows.value.find((row) => row.id === issueRowId.value) || null,
)

/** 各类日志下载子任务：弹窗内提示电脑端操作。 */
const issueShowLogPcTip = computed(() => {
  const row = issueTargetRow.value
  if (!row) return false
  if ((row.uploadRequiredWhen || 'always') === 'abnormal') return true
  return /各类日志下载/.test(String(row.description || ''))
})

function openIssue(rowId: string) {
  if (!canEditWork.value) return
  issueRowId.value = rowId
  const rec = normalizeIssueRecord(issueRecords.value[rowId])
  // 首次未选择时默认「检查正常」；已保存则保留原选项
  issueStatus.value = rec?.status || 'ok'
  issueSeverity.value = rec?.status === 'abnormal' ? (rec.severity || '') : ''
  issueText.value = rec?.status === 'ok' || rec?.status === 'no_equipment' ? '' : (rec?.text || '')
  issueOpen.value = true
}

function onIssueStatusChange() {
  if (issueStatus.value !== 'abnormal') issueSeverity.value = ''
  if (!issueDetailRequired.value) issueText.value = ''
}

function severityOptionLabel(level: AbnormalSeverity) {
  if (level === 'severe') return t.value.issueSeveritySevere
  if (level === 'moderate') return t.value.issueSeverityModerate
  if (level === 'minor') return t.value.issueSeverityMinor
  return t.value.issueSeverityUndetectable
}

function mergeIssueRecordPreferringSeverity(
  local: InspectionRecord | undefined,
  server: InspectionRecord,
): InspectionRecord {
  if (!local) return server
  const localSeverity = normalizeAbnormalSeverity(local.severity)
  const serverSeverity = normalizeAbnormalSeverity(server.severity)
  if (serverSeverity) return server
  if (!localSeverity) return server
  if (local.text === server.text || local.status === server.status) {
    return { ...server, severity: localSeverity }
  }
  const localTs = Date.parse(local.updatedAt || '') || 0
  const serverTs = Date.parse(server.updatedAt || '') || 0
  if (localTs >= serverTs) {
    return { ...server, severity: localSeverity }
  }
  return server
}

async function syncIssueDraftToServer() {
  if (!mainTaskId.value || !canEditWork.value || syncingIssueDraft.value) return
  if (!validateMileageForWork({ required: false })) return
  syncingIssueDraft.value = true
  try {
    const res = await postTaskDraft(buildTaskSubmitPayload(true)) as {
      issues?: Record<string, unknown>
      equipment?: Record<string, unknown>
    }
    const serverIssues = res?.issues && typeof res.issues === 'object' ? res.issues : null
    if (serverIssues) {
      const next = { ...issueRecords.value }
      Object.entries(serverIssues).forEach(([rowId, item]) => {
        const rec = normalizeIssueRecord(item)
        if (!rec) return
        next[rowId] = mergeIssueRecordPreferringSeverity(next[rowId], rec)
      })
      issueRecords.value = next
    }
    const serverEquipment = res?.equipment && typeof res.equipment === 'object' ? res.equipment : null
    if (serverEquipment) {
      const nextEq = { ...equipmentRecords.value }
      Object.entries(serverEquipment).forEach(([rowId, item]) => {
        const rec = normalizeEquipmentRecord(item)
        if (!rec) return
        nextEq[rowId] = { ...nextEq[rowId], ...rec }
      })
      equipmentRecords.value = nextEq
    }
    persistTaskListCache()
  } catch {
    toast(t.value.saveFail, 'error')
  } finally {
    syncingIssueDraft.value = false
  }
}

function saveIssue() {
  if (!canEditWork.value) return
  if (!issueRowId.value) return
  if (!issueStatus.value) {
    toast(t.value.issueNeedStatus, 'warn')
    return
  }
  const text = issueText.value.trim()
  if (issueStatus.value === 'abnormal' && !issueSeverity.value) {
    toast(t.value.issueNeedSeverity, 'warn')
    return
  }
  if (issueDetailRequired.value && !text) {
    toast(t.value.issueNeedDetail, 'warn')
    return
  }
  const row: InspectionRecord = {
    status: issueStatus.value,
    text: issueStatus.value === 'ok' || issueStatus.value === 'no_equipment' ? '' : text,
    updatedAt: new Date().toISOString(),
  }
  if (issueStatus.value === 'abnormal' && issueSeverity.value) {
    row.severity = issueSeverity.value
  }
  issueRecords.value = {
    ...issueRecords.value,
    [issueRowId.value]: row,
  }
  persistTaskListCache()
  toast(t.value.issueSaved)
  issueOpen.value = false
  void syncIssueDraftToServer()
}

let lastGeo: { latitude: number; longitude: number; accuracy?: number; fetchedAt: number } | null = null

function isGeoFresh() {
  return !!lastGeo && Date.now() - lastGeo.fetchedAt < 2 * 60 * 1000
}

function getGeo(timeoutMs: number): Promise<{ latitude: number; longitude: number; accuracy?: number } | null> {
  return new Promise((resolve) => {
    if (!window.isSecureContext || !navigator.geolocation) return resolve(null)
    const timer = setTimeout(() => resolve(null), Math.max(500, timeoutMs))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        const latitude = Number(pos.coords.latitude)
        const longitude = Number(pos.coords.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return resolve(null)
        const accuracy = Number.isFinite(pos.coords.accuracy) ? Number(pos.coords.accuracy) : undefined
        lastGeo = { latitude, longitude, accuracy, fetchedAt: Date.now() }
        resolve({ latitude, longitude, accuracy })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: Math.max(500, timeoutMs), maximumAge: 0 },
    )
  })
}

async function readExifMeta(file: File): Promise<Partial<ClientCaptureMeta>> {
  try {
    // `exifr` may throw on unsupported formats; keep graceful fallback.
    const exif = await exifr.parse(file, { gps: true, tiff: true, exif: true })
    if (!exif || typeof exif !== 'object') return {}
    const capturedAtRaw =
      (exif as any).DateTimeOriginal ||
      (exif as any).CreateDate ||
      (exif as any).ModifyDate ||
      (exif as any).DateTimeDigitized ||
      null
    const capturedAt =
      capturedAtRaw instanceof Date && !Number.isNaN(capturedAtRaw.getTime())
        ? capturedAtRaw.toISOString()
        : ''
    const latitude = typeof (exif as any).latitude === 'number' ? (exif as any).latitude : undefined
    const longitude = typeof (exif as any).longitude === 'number' ? (exif as any).longitude : undefined
    const accuracy = undefined
    const out: Partial<ClientCaptureMeta> = {}
    if (capturedAt) out.capturedAt = capturedAt
    if (latitude != null && longitude != null) {
      out.latitude = latitude
      out.longitude = longitude
      if (accuracy != null) out.accuracy = accuracy
    }
    return out
  } catch {
    return {}
  }
}

function formatCapturedAt(iso?: string) {
  const text = String(iso || '').trim()
  if (!text) return ''
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return text
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${dd} ${hh}:${mm}:${ss}`
}

function captureLines(capture?: UploadResult['capture']) {
  if (!capture) return []
  const lines: string[] = []
  const at = formatCapturedAt(capture.capturedAt)
  const loc = capture.location || {}
  const locText =
    (loc as any).address ||
    [loc.province, loc.city, loc.district].filter(Boolean).join(' ')
  if (at) lines.push(`${t.value.photoCapturedAt}：${at}`)
  if (locText) lines.push(`${t.value.photoCapturedLoc}：${locText}`)
  return lines
}

function uploadLabelForSlot(slotId: string, baseLabel: string) {
  const rec = uploadRecords.value[slotId]
  return resolveUploadDisplayName(slotId, baseLabel, rec?.displayName)
}

function uploadMetaTitle(slotId: string, slotLabel?: string) {
  return uploadLabelForSlot(slotId, slotLabel || '')
}

function allUploadSlotKeys(): string[] {
  const keys = new Set<string>([
    ...Object.keys(uploadRecords.value),
    ...Object.keys(localPreviewRecords.value),
    ...Object.keys(slotUploadStatus.value),
  ])
  return Array.from(keys)
}

function extraSlotIsVisible(extraId: string): boolean {
  if (displayedUploadUrl(extraId)) return true
  return slotStatusOf(extraId) !== 'idle'
}

function extraSlotsForBase(baseSlot: string): string[] {
  return listExtraUploadSlotIds(baseSlot, allUploadSlotKeys()).filter((id) => extraSlotIsVisible(id))
}

function countExtraPhotos(baseSlot: string): number {
  return listExtraUploadSlotIds(baseSlot, allUploadSlotKeys()).filter((id) => {
    if (uploadRecords.value[id]?.url || localPreviewRecords.value[id]) return true
    const st = slotStatusOf(id)
    return st === 'processing' || st === 'queued' || st === 'uploading' || st === 'failed'
  }).length
}

function canAddExtraPhoto(baseSlot: string): boolean {
  if (!canEditWork.value) return false
  if (!displayedUploadUrl(baseSlot)) return false
  return countExtraPhotos(baseSlot) < MAX_EXTRA_PHOTOS_PER_SLOT
}

function onAddExtraPhoto(baseSlot: string, baseLabel: string) {
  if (!canAddExtraPhoto(baseSlot)) {
    toast(t.value.extraPhotoMax, 'warn', 3200)
    return
  }
  addPhotoPickerTarget.value = { baseSlot, baseLabel }
  addPhotoInputRef.value?.click()
}

async function onAddPhotoPickerChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const target = addPhotoPickerTarget.value
  addPhotoPickerTarget.value = null
  try {
    if (!file || !target) return
    if (!canAddExtraPhoto(target.baseSlot)) {
      toast(t.value.extraPhotoMax, 'warn', 3200)
      return
    }
    const extraId = buildExtraUploadSlotId(
      target.baseSlot,
      nextExtraUploadIndex(target.baseSlot, allUploadSlotKeys()),
    )
    await processSelectedUploadFile(extraId, target.baseLabel, file)
  } finally {
    input.value = ''
  }
}

function labelForUploadSlot(slotId: string): string {
  const baseSlot = getBaseUploadSlotId(slotId)
  for (const row of guidanceRows.value) {
    const buttons = Array.isArray(row.buttons) ? row.buttons : []
    for (const btn of buttons) {
      if (String(btn?.slot || '').trim() === baseSlot) {
        return String(btn?.label || '').trim()
      }
    }
  }
  return ''
}

function uploadSlotHasContent(slotId: string): boolean {
  if (String(uploadRecords.value[slotId]?.url || '').trim()) return true
  if (localPreviewRecords.value[slotId]) return true
  const st = slotStatusOf(slotId)
  return st === 'processing' || st === 'queued' || st === 'uploading' || st === 'failed'
}

/** 删除后把剩余照片顶到 base / extra_1 / extra_2…，并修正展示名 */
function compactUploadSlotsForBase(baseSlot: string, baseLabel: string) {
  const base = String(baseSlot || '').trim()
  if (!base) return
  const keys = allUploadSlotKeys()
  const moves = buildCompactUploadSlotMoves(base, keys, uploadSlotHasContent)
  const needsRemap = moves.some((m) => m.from !== m.to)
    || moves.some((m) => {
      if (m.extraIndex == null) {
        return !!String(uploadRecords.value[m.to]?.displayName || '').trim()
      }
      const expected = buildExtraDisplayName(baseLabel, m.extraIndex)
      return uploadRecords.value[m.to]?.displayName !== expected
    })
  if (!moves.length && !needsRemap) return

  type Snap = {
    record?: { url: string; capture?: UploadResult['capture']; displayName?: string }
    preview?: string
    status?: SlotUploadStatus
    prepared?: PreparedUpload
    pending?: PendingRetrySource
    queue: UploadQueueItem[]
  }

  const snaps: Snap[] = moves.map(({ from }) => ({
    record: uploadRecords.value[from]
      ? { ...uploadRecords.value[from] }
      : undefined,
    preview: localPreviewRecords.value[from],
    status: slotUploadStatus.value[from],
    prepared: preparedUploads.value[from],
    pending: pendingRetrySources.value[from],
    queue: uploadQueue.value.filter(
      (q) => q.slotId === from && q.taskId === mainTaskId.value,
    ),
  }))

  const taskId = mainTaskId.value
  for (const id of groupUploadSlotIds(base, keys)) {
    removeSlotFromUploadQueue(id, taskId)
    clearPendingRetrySource(id)
    cleanupLocalPreview(id)
    const nextPrepared = { ...preparedUploads.value }
    delete nextPrepared[id]
    preparedUploads.value = nextPrepared
    const nextRecords = { ...uploadRecords.value }
    delete nextRecords[id]
    uploadRecords.value = nextRecords
    const nextStatus = { ...slotUploadStatus.value }
    delete nextStatus[id]
    slotUploadStatus.value = nextStatus
  }

  moves.forEach(({ to, extraIndex }, i) => {
    const snap = snaps[i]
    if (!snap) return
    if (snap.record?.url) {
      const record = { ...snap.record }
      if (extraIndex == null) {
        delete record.displayName
      } else {
        record.displayName = buildExtraDisplayName(baseLabel, extraIndex)
      }
      uploadRecords.value = { ...uploadRecords.value, [to]: record }
    }
    if (snap.preview) {
      localPreviewRecords.value = { ...localPreviewRecords.value, [to]: snap.preview }
    }
    if (snap.status && snap.status !== 'idle') {
      setSlotUploadStatus(to, snap.status)
    } else if (uploadRecords.value[to]?.url) {
      setSlotUploadStatus(to, 'success')
    }
    if (snap.prepared) {
      preparedUploads.value = {
        ...preparedUploads.value,
        [to]: { ...snap.prepared, slotId: to, slotLabel: extraIndex == null ? baseLabel : buildExtraDisplayName(baseLabel, extraIndex) },
      }
    }
    if (snap.pending) {
      pendingRetrySources.value = {
        ...pendingRetrySources.value,
        [to]: { ...snap.pending, slotId: to, slotLabel: extraIndex == null ? baseLabel : buildExtraDisplayName(baseLabel, extraIndex) },
      }
    }
    if (snap.queue.length) {
      uploadQueue.value = [
        ...uploadQueue.value,
        ...snap.queue.map((q) => ({ ...q, slotId: to })),
      ]
    }
  })

  if (previewOpen.value && previewSlotId.value) {
    const hit = moves.find((m) => m.from === previewSlotId.value)
    if (hit) previewSlotId.value = hit.to
  }
}

function removeSlotPhoto(slotId: string) {
  if (!canEditWork.value) return
  const taskId = mainTaskId.value
  const baseSlot = getBaseUploadSlotId(slotId)
  const baseLabel = labelForUploadSlot(slotId)
  removeSlotFromUploadQueue(slotId, taskId)
  const nextPrepared = { ...preparedUploads.value }
  delete nextPrepared[slotId]
  preparedUploads.value = nextPrepared
  clearPendingRetrySource(slotId)
  cleanupLocalPreview(slotId)
  const nextRecords = { ...uploadRecords.value }
  delete nextRecords[slotId]
  uploadRecords.value = nextRecords
  setSlotUploadStatus(slotId, 'idle')
  if (previewOpen.value && previewSlotId.value === slotId) closeUploadPreview()
  compactUploadSlotsForBase(baseSlot, baseLabel)
  persistTaskListCache()
  void syncIssueDraftToServer()
}

function uploadMetaLines(slotId: string) {
  return captureLines(uploadRecords.value[slotId]?.capture)
}

function resolveTaskStatus(entry: unknown): 'todo' | 'doing' | 'done' | 'rejected' | null {
  const e = entry as { status?: string; rejected?: boolean } | null
  if (!e) return null
  if (e.status === 'rejected') return 'rejected'
  if (e.status === 'todo' && e.rejected) return 'rejected'
  if (e.status === 'todo' || e.status === 'doing' || e.status === 'done') return e.status
  return null
}

function taskListCacheKey() {
  return `butler.task-list.${auth.user?.employeeId || 'guest'}.${mainTaskId.value}`
}

function readTaskListCache() {
  try {
    const raw = sessionStorage.getItem(taskListCacheKey())
    if (!raw) return null
    return JSON.parse(raw) as {
      uploadRecords?: Record<string, { url: string; capture?: UploadResult['capture']; displayName?: string }>
      issueRecords?: Record<string, InspectionRecord>
      equipmentRecords?: Record<string, EquipmentRecord>
      currentTaskStatus?: 'todo' | 'doing' | 'done' | 'rejected'
      taskRejected?: boolean
      maintType?: string
      mileageKm?: string
    }
  } catch {
    return null
  }
}

function persistTaskListCache() {
  try {
    sessionStorage.setItem(taskListCacheKey(), JSON.stringify({
      uploadRecords: uploadRecords.value,
      issueRecords: issueRecords.value,
      equipmentRecords: equipmentRecords.value,
      currentTaskStatus: currentTaskStatus.value,
      maintType: maintType.value,
      mileageKm: mileageKmInput.value,
    }))
  } catch { /* ignore quota / private mode */ }
}

function clearTaskListCache() {
  try {
    sessionStorage.removeItem(taskListCacheKey())
  } catch { /* ignore */ }
}

function applyMaintFromQueryOrDetail(raw: unknown) {
  const normalized = normalizeMaint(raw)
  if (normalized) {
    maintType.value = normalized
    return
  }
  const compact = String(raw || '').trim().toLowerCase().replace(/[/\s_-]/g, '')
  // 保留未迁移的历史聚合值，便于筛选模版
  if (compact === 'c1c3' || compact === 'c4c6') maintType.value = compact
}

async function hydrateTaskPage() {
  applyMaintFromQueryOrDetail(route.query.maint)

  taskDetail.value = null
  mileageKmInput.value = ''
  uploadRecords.value = {}
  issueRecords.value = {}
  equipmentRecords.value = {}
  preparedUploads.value = {}
  pendingRetrySources.value = {}
  addPhotoPickerTarget.value = null
  uploadQueue.value = []
  slotUploadStatus.value = {}
  revokeAllLocalPreviews()
  closeUploadPreview()
  hydrateGeneration += 1
  const hydrateToken = hydrateGeneration

  const cached = readTaskListCache()
  if (cached) {
    if (cached.uploadRecords && typeof cached.uploadRecords === 'object') {
      uploadRecords.value = cached.uploadRecords
    }
    if (cached.issueRecords && typeof cached.issueRecords === 'object') {
      const next: Record<string, InspectionRecord> = {}
      Object.entries(cached.issueRecords).forEach(([rowId, item]) => {
        const rec = normalizeIssueRecord(item)
        if (rec) next[rowId] = rec
      })
      issueRecords.value = next
    }
    if (cached.equipmentRecords && typeof cached.equipmentRecords === 'object') {
      const nextEq: Record<string, EquipmentRecord> = {}
      Object.entries(cached.equipmentRecords).forEach(([rowId, item]) => {
        const rec = normalizeEquipmentRecord(item)
        if (rec) nextEq[rowId] = rec
      })
      equipmentRecords.value = nextEq
    }
    if (cached.currentTaskStatus === 'todo' || cached.currentTaskStatus === 'doing' || cached.currentTaskStatus === 'done' || cached.currentTaskStatus === 'rejected') {
      currentTaskStatus.value = cached.currentTaskStatus
    } else if (cached.taskRejected) {
      currentTaskStatus.value = 'rejected'
    }
    if (cached.maintType) applyMaintFromQueryOrDetail(cached.maintType)
    if (cached.mileageKm != null && String(cached.mileageKm).trim()) {
      mileageKmInput.value = String(cached.mileageKm).trim()
    }
  }

  if (hydrateToken !== hydrateGeneration) return

  if (guidanceDocMemoryCache) {
    guidanceDoc.value = guidanceDocMemoryCache
  } else if (!guidanceDoc.value) {
    try {
      const data = await fetchGuidanceTasks()
      if (hydrateToken !== hydrateGeneration) return
      guidanceDoc.value = data
      guidanceDocMemoryCache = data
    } catch { toast('Load failed') }
  }

  if (auth.user?.employeeId) {
    await loadUploadConfig(auth.user.employeeId)
    if (hydrateToken !== hydrateGeneration) return
    try {
      if (mainTaskId.value) {
        const detailData = await fetchTaskDetail(mainTaskId.value)
        if (hydrateToken !== hydrateGeneration) return
        if (detailData?.task) {
          taskDetail.value = detailData.task
          applyMileageFromDetail(detailData.task)
          if (detailData.task.maint) applyMaintFromQueryOrDetail(detailData.task.maint)
          if (
            detailData.task.status === 'todo'
            || detailData.task.status === 'doing'
            || detailData.task.status === 'done'
            || detailData.task.status === 'rejected'
          ) {
            currentTaskStatus.value = detailData.task.status
          }
        }
      }

      if (!taskDetail.value) {
        const statusData = await fetchTaskStatus(auth.user.employeeId)
        if (hydrateToken !== hydrateGeneration) return
        const entry = effectiveTaskKey.value
          ? statusData?.statuses?.[effectiveTaskKey.value]
          : statusData?.statuses?.[maintType.value]
        const resolved = entry ? resolveTaskStatus(entry) : null
        if (resolved) currentTaskStatus.value = resolved
      }
    } catch { /* */ }
  }

  if (mainTaskId.value) {
    try {
      const latest = await fetchLatestTaskSubmit(mainTaskId.value)
      if (hydrateToken !== hydrateGeneration) return
      if (latest && latest.found) {
        // 服务端 uploads 为完整快照：覆盖本地，避免已删除图片被缓存“加回”
        const uploads = latest.uploads && typeof latest.uploads === 'object' ? latest.uploads : {}
        const nextUploads: Record<string, { url: string; capture?: UploadResult['capture']; displayName?: string }> = {}
        Object.entries(uploads).forEach(([slot, item]) => {
          const url = String((item as any)?.url || '').trim()
          if (!url) return
          const displayName = String((item as any)?.displayName || '').trim()
          nextUploads[slot] = {
            url,
            capture: (item as any)?.capture,
            ...(displayName ? { displayName } : {}),
          }
        })
        uploadRecords.value = nextUploads
        const issues = latest.issues && typeof latest.issues === 'object' ? latest.issues : {}
        const mergedIssues = { ...issueRecords.value }
        Object.entries(issues).forEach(([rowId, item]) => {
          const rec = normalizeIssueRecord(item)
          if (!rec) return
          mergedIssues[rowId] = mergeIssueRecordPreferringSeverity(mergedIssues[rowId], rec)
        })
        issueRecords.value = mergedIssues
        const equipment = latest.equipment && typeof latest.equipment === 'object' ? latest.equipment : {}
        const mergedEquipment = { ...equipmentRecords.value }
        Object.entries(equipment).forEach(([rowId, item]) => {
          const rec = normalizeEquipmentRecord(item)
          if (!rec) return
          mergedEquipment[rowId] = { ...mergedEquipment[rowId], ...rec }
        })
        equipmentRecords.value = mergedEquipment
        persistTaskListCache()
      }
    } catch {
      // ignore: keep page usable even when no historical draft available
    }
  }

  if (hydrateToken !== hydrateGeneration) return

  const nextStatus: Record<string, SlotUploadStatus> = { ...slotUploadStatus.value }
  Object.keys(uploadRecords.value).forEach((slotId) => {
    if (uploadRecords.value[slotId]?.url) nextStatus[slotId] = 'success'
  })
  slotUploadStatus.value = nextStatus

  const rows = visibleRows.value
  const preferred = rows.find((row) => !isRowWorkComplete(row)) || rows[0]
  expandedRowId.value = preferred?.id || ''
}

function displayedUploadUrl(slotId: string) {
  // 优先本地预览：更换失败时仍展示待传新图，避免误以为旧服务器图已替换成功
  return localPreviewRecords.value[slotId] || uploadRecords.value[slotId]?.url || ''
}

function slotStatusOf(slotId: string): SlotUploadStatus {
  return slotUploadStatus.value[slotId] || 'idle'
}

function setSlotUploadStatus(slotId: string, status: SlotUploadStatus) {
  slotUploadStatus.value = { ...slotUploadStatus.value, [slotId]: status }
}

function hasBusyUploads() {
  return Object.values(slotUploadStatus.value).some(
    (status) => status === 'processing' || status === 'queued' || status === 'uploading',
  )
}

function hasUnresolvedFailedUploads() {
  return Object.values(slotUploadStatus.value).some((status) => status === 'failed')
}

function leaveWhileUploadingMessage() {
  return lang.value === 'zh'
    ? '仍有图片正在处理或上传，离开页面可能导致未完成上传丢失。确定离开吗？'
    : 'Images are still processing or uploading. Leaving may lose unfinished uploads. Leave anyway?'
}

function unresolvedFailedUploadMessage() {
  return lang.value === 'zh'
    ? '仍有图片上传失败，请先重试或更换后再提交'
    : 'Some uploads failed. Retry or replace them before submitting.'
}

function lowResWarningMessage() {
  return lang.value === 'zh'
    ? '图片分辨率较低，可能无法看清细节'
    : 'Image resolution is low; details may be hard to see'
}

function cleanupLocalPreview(slotId: string) {
  const previewUrl = localPreviewRecords.value[slotId]
  if (previewUrl && previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
  delete localPreviewRecords.value[slotId]
}

function revokeAllLocalPreviews() {
  Object.keys(localPreviewRecords.value).forEach((slotId) => cleanupLocalPreview(slotId))
}

function removeQueueItemExact(item: UploadQueueItem) {
  uploadQueue.value = uploadQueue.value.filter(
    (q) => !(q.slotId === item.slotId && q.token === item.token && q.taskId === item.taskId),
  )
}

/** 仅移除当前任务下该槽位的排队项，避免误删其他任务同名槽 */
function removeSlotFromUploadQueue(slotId: string, taskId = mainTaskId.value) {
  uploadQueue.value = uploadQueue.value.filter(
    (q) => !(q.slotId === slotId && q.taskId === taskId),
  )
}

function isActiveUploadJob(slotId: string, token: number, taskId: string) {
  const job = preparedUploads.value[slotId]
  return !!job
    && job.token === token
    && job.taskId === taskId
    && mainTaskId.value === taskId
}

function clearPendingRetrySource(slotId: string) {
  if (!pendingRetrySources.value[slotId]) return
  const next = { ...pendingRetrySources.value }
  delete next[slotId]
  pendingRetrySources.value = next
}

function openUploadPreview(slotId: string) {
  const url = displayedUploadUrl(slotId)
  if (!url) return
  previewSlotId.value = slotId
  previewBlobUrl.value = localPreviewRecords.value[slotId] || ''
  previewSrc.value = url
  previewZoom.value = 1
  previewOpen.value = true
}

function closeUploadPreview() {
  previewOpen.value = false
  previewSrc.value = ''
  previewZoom.value = 1
  previewSlotId.value = ''
  previewBlobUrl.value = ''
}

function setPreviewZoom(next: number) {
  previewZoom.value = Math.min(4, Math.max(1, next))
}

/** 上传成功后：若正在放大预览该本地 blob，先切到服务器 URL 再释放 */
function cleanupLocalPreviewAfterSuccess(slotId: string, serverUrl: string) {
  const localUrl = localPreviewRecords.value[slotId]
  if (
    previewOpen.value
    && previewSlotId.value === slotId
    && localUrl
    && (previewSrc.value === localUrl || previewBlobUrl.value === localUrl)
  ) {
    previewSrc.value = serverUrl
    previewBlobUrl.value = ''
  }
  cleanupLocalPreview(slotId)
}

function imageBitmapToJpegFile(bitmap: ImageBitmap, filenameBase: string, quality = 0.82): Promise<File> {
  const MAX_EDGE = 1920
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_ctx_unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('image_compress_failed'))
      resolve(new File([blob], `${filenameBase}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
    }, 'image/jpeg', quality)
  })
}

async function resizeImageBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const MAX_EDGE = 1920
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale >= 1) return bitmap
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  try {
    const resized = await createImageBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    })
    bitmap.close()
    return resized
  } catch {
    return bitmap
  }
}

async function prepareImageViaHtmlImage(
  file: File,
  filenameBase: string,
  keepOriginal: boolean,
): Promise<{ uploadFile: File; width: number | null; height: number | null }> {
  const srcUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image_decode_failed'))
      img.src = srcUrl
    })
    const width = img.naturalWidth || 0
    const height = img.naturalHeight || 0
    if (keepOriginal) return { uploadFile: file, width, height }

    const MAX_EDGE = 1920
    const scale = Math.min(1, MAX_EDGE / Math.max(width || 1, height || 1))
    const outW = Math.max(1, Math.round((width || 1) * scale))
    const outH = Math.max(1, Math.round((height || 1) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_ctx_unavailable')
    ctx.drawImage(img, 0, 0, outW, outH)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) throw new Error('image_compress_failed')
    return {
      uploadFile: new File([blob], `${filenameBase}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
      width,
      height,
    }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}

/** 一次解码完成尺寸检查与（必要时）压缩；createImageBitmap 失败时回退 Image（兼容 HEIC/AVIF） */
async function prepareImageForUpload(file: File): Promise<{
  uploadFile: File
  width: number | null
  height: number | null
}> {
  if (!file.type.startsWith('image/')) {
    return { uploadFile: file, width: null, height: null }
  }

  const filenameBase = String(file.name || 'upload').replace(/\.[^.]+$/, '') || 'upload'
  const keepOriginal = file.size <= 1.2 * 1024 * 1024

  if ('createImageBitmap' in window) {
    try {
      let bitmap = await createImageBitmap(file)
      const width = bitmap.width
      const height = bitmap.height
      try {
        if (keepOriginal) {
          bitmap.close()
          return { uploadFile: file, width, height }
        }
        bitmap = await resizeImageBitmap(bitmap)
        try {
          const uploadFile = await imageBitmapToJpegFile(bitmap, filenameBase)
          return { uploadFile, width, height }
        } finally {
          bitmap.close()
        }
      } catch {
        try { bitmap.close() } catch { /* ignore */ }
        // 继续尝试 Image 回退
      }
    } catch {
      // createImageBitmap 不支持该格式时回退
    }
  }

  return prepareImageViaHtmlImage(file, filenameBase, keepOriginal)
}

function enqueuePreparedUpload(job: PreparedUpload) {
  clearPendingRetrySource(job.slotId)
  preparedUploads.value = { ...preparedUploads.value, [job.slotId]: job }
  removeSlotFromUploadQueue(job.slotId, job.taskId)
  const item: UploadQueueItem = { slotId: job.slotId, token: job.token, taskId: job.taskId }
  uploadQueue.value = [...uploadQueue.value, item]
  setSlotUploadStatus(job.slotId, 'queued')
  void pumpUploadQueue()
}

async function pumpUploadQueue() {
  if (uploadPumpRunning) return
  uploadPumpRunning = true
  try {
    while (uploadPageAlive && uploadQueue.value.length > 0) {
      const item = uploadQueue.value[0]
      if (!item) break

      const job = preparedUploads.value[item.slotId]
      if (!job || job.token !== item.token || job.taskId !== item.taskId) {
        // 陈旧队列项：只删这一项，绝不按 slotId 误伤新任务
        removeQueueItemExact(item)
        continue
      }

      const { slotId, token, taskId } = item
      if (mainTaskId.value !== taskId) {
        // 页面已切到其他任务：丢弃旧任务排队项，不碰新任务状态
        removeQueueItemExact(item)
        continue
      }

      setSlotUploadStatus(slotId, 'uploading')
      try {
        const data = await uploadImage(slotId, job.uploadFile, job.slotLabel || slotId, job.clientMeta, {
          taskId,
          employeeId: auth.user?.employeeId || '',
        })
        if (!uploadPageAlive || !isActiveUploadJob(slotId, token, taskId)) {
          removeQueueItemExact(item)
          continue
        }
        const displayName = String(data.displayName || job.slotLabel || '').trim()
        uploadRecords.value[slotId] = {
          url: data.url,
          capture: data.capture,
          ...(displayName ? { displayName } : {}),
        }
        cleanupLocalPreviewAfterSuccess(slotId, data.url)
        const nextPrepared = { ...preparedUploads.value }
        delete nextPrepared[slotId]
        preparedUploads.value = nextPrepared
        clearPendingRetrySource(slotId)
        setSlotUploadStatus(slotId, 'success')
        persistTaskListCache()
      } catch {
        if (!uploadPageAlive || !isActiveUploadJob(slotId, token, taskId)) {
          removeQueueItemExact(item)
          continue
        }
        setSlotUploadStatus(slotId, 'failed')
        toast(t.value.uploadFail)
      }
      removeQueueItemExact(item)
    }
  } finally {
    uploadPumpRunning = false
    if (uploadPageAlive && uploadQueue.value.length > 0) {
      void pumpUploadQueue()
    }
  }
}

async function prepareAndEnqueueUpload(
  slotId: string,
  slotLabel: string,
  file: File,
  token: number,
  taskId = mainTaskId.value,
) {
  if (mainTaskId.value !== taskId) return
  setSlotUploadStatus(slotId, 'processing')
  try {
    const prepared = await prepareImageForUpload(file)
    if (!uploadPageAlive || slotTokens[slotId] !== token || mainTaskId.value !== taskId) return

    if (prepared.width != null && prepared.height != null
      && Math.max(prepared.width, prepared.height) < LOW_RES_MAX_EDGE) {
      toast(lowResWarningMessage(), 'warn', 3200)
    }

    if (prepared.uploadFile.size > uploadMaxBytes.value) {
      toast(uploadTooLargeMessage(), 'error')
      cleanupLocalPreview(slotId)
      const nextPrepared = { ...preparedUploads.value }
      delete nextPrepared[slotId]
      preparedUploads.value = nextPrepared
      clearPendingRetrySource(slotId)
      setSlotUploadStatus(slotId, uploadRecords.value[slotId]?.url ? 'success' : 'idle')
      return
    }

    const geoPromise = isGeoFresh() ? Promise.resolve(lastGeo) : getGeo(2500)
    const exifMeta = await readExifMeta(file)
    if (!uploadPageAlive || slotTokens[slotId] !== token || mainTaskId.value !== taskId) return

    const geo = (exifMeta.latitude != null && exifMeta.longitude != null) ? null : await geoPromise
    if (!uploadPageAlive || slotTokens[slotId] !== token || mainTaskId.value !== taskId) return

    const clientMeta: ClientCaptureMeta = {
      capturedAt: exifMeta.capturedAt || new Date().toISOString(),
    }
    if (exifMeta.latitude != null && exifMeta.longitude != null) {
      clientMeta.latitude = exifMeta.latitude
      clientMeta.longitude = exifMeta.longitude
    } else if (geo) {
      clientMeta.latitude = geo.latitude
      clientMeta.longitude = geo.longitude
      if (geo.accuracy != null) clientMeta.accuracy = geo.accuracy
    }

    enqueuePreparedUpload({
      slotId,
      slotLabel: slotLabel || slotId,
      uploadFile: prepared.uploadFile,
      clientMeta,
      token,
      taskId,
    })
  } catch {
    if (!uploadPageAlive || slotTokens[slotId] !== token || mainTaskId.value !== taskId) return
    // 预处理失败：只保留原图供完整重试，绝不把未校验原图直接入队
    const nextPrepared = { ...preparedUploads.value }
    delete nextPrepared[slotId]
    preparedUploads.value = nextPrepared
    pendingRetrySources.value = {
      ...pendingRetrySources.value,
      [slotId]: {
        slotId,
        slotLabel: slotLabel || slotId,
        sourceFile: file,
        token,
        taskId,
      },
    }
    setSlotUploadStatus(slotId, 'failed')
    toast(t.value.uploadFail)
  }
}

function retryUpload(slotId: string) {
  if (!canEditWork.value) return
  if (slotStatusOf(slotId) !== 'failed') return

  const prepared = preparedUploads.value[slotId]
  if (prepared && prepared.taskId === mainTaskId.value) {
    // 网络上传失败：已校验过的 uploadFile，直接重新入队
    removeSlotFromUploadQueue(slotId, prepared.taskId)
    uploadQueue.value = [...uploadQueue.value, {
      slotId: prepared.slotId,
      token: prepared.token,
      taskId: prepared.taskId,
    }]
    setSlotUploadStatus(slotId, 'queued')
    void pumpUploadQueue()
    return
  }

  const source = pendingRetrySources.value[slotId]
  if (!source || source.taskId !== mainTaskId.value) return
  // 预处理失败：重新走完整压缩 / 大小校验
  const token = (slotTokens[slotId] || 0) + 1
  slotTokens[slotId] = token
  pendingRetrySources.value = {
    ...pendingRetrySources.value,
    [slotId]: { ...source, token },
  }
  void prepareAndEnqueueUpload(slotId, source.slotLabel, source.sourceFile, token, source.taskId)
}

async function processSelectedUploadFile(slotId: string, baseLabel: string, file: File) {
  const slotLabel = uploadLabelForSlot(slotId, baseLabel)
  if (!canEditWork.value) return
  if (!isAllowedUploadType(file)) {
    toast(invalidUploadTypeMessage(), 'error')
    return
  }

  const taskId = mainTaskId.value
  const token = (slotTokens[slotId] || 0) + 1
  slotTokens[slotId] = token
  removeSlotFromUploadQueue(slotId, taskId)
  clearPendingRetrySource(slotId)
  const nextPrepared = { ...preparedUploads.value }
  delete nextPrepared[slotId]
  preparedUploads.value = nextPrepared

  const previewUrl = URL.createObjectURL(file)
  cleanupLocalPreview(slotId)
  localPreviewRecords.value[slotId] = previewUrl
  if (previewOpen.value && previewSlotId.value === slotId) {
    previewSrc.value = previewUrl
    previewBlobUrl.value = previewUrl
  }
  persistTaskListCache()
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  await prepareAndEnqueueUpload(slotId, slotLabel || slotId, file, token, taskId)
}

async function handleUpload(slotId: string, baseLabel: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  try {
    if (!file) return
    await processSelectedUploadFile(slotId, baseLabel, file)
  } finally {
    input.value = ''
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasBusyUploads()) return
  event.preventDefault()
  event.returnValue = ''
}

function confirmLeaveWhileBusy(): boolean {
  if (!hasBusyUploads()) return true
  return window.confirm(leaveWhileUploadingMessage())
}

async function setTaskStatus(status: 'todo' | 'doing' | 'done' | 'rejected'): Promise<boolean> {
  const employeeId = auth.user?.employeeId || ''
  if (!employeeId) return false
  try {
    const data = await postTaskStatus(
      employeeId,
      maintType.value,
      status,
      effectiveTaskKey.value || undefined,
      {
        taskId: mainTaskId.value,
        title: String(route.query.title || '').trim(),
        deadline: String(route.query.deadline || '').trim(),
      },
    ) as any
    if (data && data.ok === false) return false
    const returned = typeof data?.status === 'string'
      ? data.status
      : resolveTaskStatus(data?.status || data?.statuses?.[effectiveTaskKey.value || ''])
    if (returned && returned !== status) return false
    return true
  } catch {
    return false
  }
}

async function onSave() {
  if (isViewOnly.value) return
  if (savingDraft.value) return
  if (!validateMileageForWork({ required: false })) return
  savingDraft.value = true
  try {
    await postTaskDraft(buildTaskSubmitPayload(true))
    persistTaskListCache()
    toast(t.value.saved, 'success')
  } catch {
    toast(t.value.saveFail, 'error')
  } finally {
    savingDraft.value = false
  }
}

async function onAccept() {
  if (isViewOnly.value) return
  const ok = await setTaskStatus('doing')
  if (ok) {
    currentTaskStatus.value = 'doing'
    homeRefreshStamp.value = Date.now()
  }
  toast(ok ? (t.value as any).acceptedToDoing : t.value.saved, ok ? 'success' : 'warn')
}

async function onReject() {
  if (isViewOnly.value) return
  const ok = await setTaskStatus('rejected')
  if (!ok) {
    toast((t.value as any).rejectFailed || (lang.value === 'zh' ? '拒绝失败，请稍后重试' : 'Reject failed. Please try again.'), 'error')
    return
  }
  currentTaskStatus.value = 'rejected'
  homeRefreshStamp.value = Date.now()
  toast((t.value as any).rejected || (lang.value === 'zh' ? '已拒绝，该任务仍保留在 To Do' : 'Rejected. Task stays in To Do'), 'info')
  await wait(700)
  router.push({ path: '/', query: { refresh: String(homeRefreshStamp.value) } })
}

/** 提交用精简汇总：total + text + groups（UI 展示仍用 abnormalitySummaryLines） */
function buildAbnormalitySummaryPayload() {
  const groups = abnormalitySummaryGroups.value
  const lines = abnormalitySummaryLines.value
  return {
    total: abnormalitySummaryTotal.value,
    text: lines.join('\n'),
    groups: {
      severe: groups.severe.map((it) => ({ seq: it.seq, text: it.text })),
      moderate: groups.moderate.map((it) => ({ seq: it.seq, text: it.text })),
      minor: groups.minor.map((it) => ({ seq: it.seq, text: it.text })),
    },
  }
}

function buildTaskSubmitPayload(allowEmptyUploads = false) {
  const uploads: Record<string, { url: string; capture?: UploadResult['capture']; displayName?: string }> = {}
  Object.entries(uploadRecords.value).forEach(([slot, meta]) => {
    const url = String(meta?.url || '').trim()
    if (!url) return
    uploads[slot] = {
      url,
      ...(meta?.capture ? { capture: meta.capture } : {}),
      ...(meta?.displayName ? { displayName: meta.displayName } : {}),
    }
  })
  const mileageKm = normalizeMileageKmInput(mileageKmInput.value)
  return {
    basicInfo: {
      maintenanceType: maintType.value,
      employeeId: auth.user?.employeeId,
      taskId: mainTaskId.value,
      trainNo: basicTrainNo.value === EMPTY_FIELD ? trainNoForTemplate.value : basicTrainNo.value,
      trainModel: basicTrainModel.value === EMPTY_FIELD ? '' : basicTrainModel.value,
      depot: basicServiceLocation.value === EMPTY_FIELD ? '' : basicServiceLocation.value,
      templateKey: guidanceTemplateKey.value,
      ...(mileageKm != null ? { mileageKm } : {}),
    },
    uploads,
    issues: buildIssuesSubmitMap(issueRecords.value),
    equipment: buildEquipmentSubmitMap(equipmentRecords.value),
    abnormalitySummary: buildAbnormalitySummaryPayload(),
    ...(allowEmptyUploads ? { allowEmptyUploads: true } : {}),
  }
}

function notifyReportStatus(report: TaskSubmitResponse['report']) {
  if (!report) return
  if (report.ok && report.status === 'queued') {
    toast(t.value.reportQueued, 'success')
    return
  }
  if (report.ok === false) {
    toast(t.value.reportEnqueueFailed, 'warn')
  }
}

async function finalizeSubmit(submitResp: TaskSubmitResponse) {
  const doneUpdated = await setTaskStatus('done')
  if (!doneUpdated) {
    toast('Submit succeeded, but Done status sync failed', 'warn')
    return
  }
  currentTaskStatus.value = 'done'
  clearTaskListCache()
  toast(t.value.submitted, 'success')
  notifyReportStatus(submitResp.report)
  await wait(900)
  homeRefreshStamp.value = Date.now()
  router.push({ path: '/', query: { refresh: String(homeRefreshStamp.value) } })
}

/** 提交前公共校验；通过返回 true。 */
function runSubmitGates(): boolean {
  if (!validateMileageForWork({ required: true })) return false
  if (hasBusyUploads()) {
    toast(
      lang.value === 'zh'
        ? '仍有图片正在处理或上传，请稍后再提交'
        : 'Images are still processing or uploading. Please wait before submitting.',
      'warn',
    )
    return false
  }
  if (hasUnresolvedFailedUploads()) {
    toast(unresolvedFailedUploadMessage(), 'warn')
    return false
  }
  if (incompleteInspectionRows.value.length) {
    toast(t.value.submitNeedAllResults, 'warn')
    focusFirstIncompleteInspection()
    return false
  }
  if (incompleteEquipmentRows.value.length) {
    toast(t.value.submitNeedAllEquipment, 'warn')
    focusFirstIncompleteEquipment()
    return false
  }
  if (hardIncompleteUploadRows.value.length) {
    toast(
      lang.value === 'zh'
        ? '日志检查发现异常时，请先上传异常照片再提交'
        : 'Upload abnormal log photos before submitting when the inspection result is abnormal.',
      'warn',
    )
    focusFirstHardIncompleteUpload()
    return false
  }
  return true
}

function openAbnormalitySummary(allowEmptyUploads: boolean) {
  pendingSubmitAllowEmpty.value = allowEmptyUploads
  abnormalitySummaryOpen.value = true
}

async function executeTaskSubmit(allowEmptyUploads = false) {
  if (submittingTask.value) return
  submittingTask.value = true
  try {
    const submitResp = await postTaskSubmit(buildTaskSubmitPayload(allowEmptyUploads))
    await finalizeSubmit(submitResp)
  } catch {
    toast('Submit failed', 'error')
  } finally {
    submittingTask.value = false
  }
}

async function onSubmit() {
  if (isViewOnly.value) return
  if (!runSubmitGates()) return
  if (!isSubmitReady.value) {
    submitConfirmOpen.value = true
    return
  }
  openAbnormalitySummary(false)
}

async function confirmSubmitWithMissingUploads() {
  if (!runSubmitGates()) {
    submitConfirmOpen.value = false
    return
  }
  submitConfirmOpen.value = false
    const hasAnyUpload = Object.values(uploadRecords.value).some((row) => String(row?.url || '').trim())
  openAbnormalitySummary(!hasAnyUpload)
}

async function confirmAbnormalitySummarySubmit() {
  if (submittingTask.value) return
  const allowEmpty = pendingSubmitAllowEmpty.value
  abnormalitySummaryOpen.value = false
  await executeTaskSubmit(allowEmpty)
}

function onEditRequest() {
  if (isViewOnly.value) return
  editRequestReason.value = ''
  editRequestOpen.value = true
}

async function submitEditRequest() {
  const reason = editRequestReason.value.trim()
  if (!reason) {
    toast(lang.value === 'zh' ? '请先填写修改原因' : 'Please provide a reason', 'warn')
    return
  }
  const employeeId = auth.user?.employeeId || ''
  if (!employeeId) {
    toast(lang.value === 'zh' ? '缺少员工信息，无法提交申请' : 'Missing employee info', 'error')
    return
  }
  if (editRequestSubmitting.value) return
  editRequestSubmitting.value = true
  let requestSaved = false
  try {
    try {
      await postTaskEditRequest({
        employeeId,
        maint: maintType.value,
        reason,
        taskId: mainTaskId.value,
      })
      requestSaved = true
    } catch (err) {
      console.warn('[TaskList] postTaskEditRequest failed, continue with test flow:', err)
    }

    const movedToDoing = await setTaskStatus('doing')
    if (movedToDoing) {
      currentTaskStatus.value = 'doing'
      editRequestOpen.value = false
      if (requestSaved) {
        toast(lang.value === 'zh' ? '编辑申请已提交，任务状态已切换为 Doing' : 'Edit request submitted. Task moved to Doing.', 'success')
      } else {
        toast(lang.value === 'zh' ? '编辑申请接口不可用，已按测试流程切换为 Doing' : 'Edit API unavailable. Task moved to Doing for testing.', 'warn')
      }
      return
    }

    toast(
      requestSaved
        ? (lang.value === 'zh' ? '编辑申请已提交，但状态切换失败' : 'Edit request submitted, but failed to switch status.')
        : (lang.value === 'zh' ? '编辑申请与状态切换均失败' : 'Edit request and status switch both failed.'),
      'error',
    )
  } catch {
    toast(lang.value === 'zh' ? '处理失败，请稍后重试' : 'Process failed, please try again.', 'error')
  } finally {
    editRequestSubmitting.value = false
  }
}

onMounted(() => {
  uploadPageAlive = true
  window.addEventListener('beforeunload', onBeforeUnload)
  hydrateTaskPage()
})

watch(mainTaskId, (next, prev) => {
  if (next && next !== prev) hydrateTaskPage()
})

watch([uploadRecords, issueRecords, equipmentRecords, currentTaskStatus, maintType, mileageKmInput], () => {
  persistTaskListCache()
}, { deep: true })

onBeforeRouteUpdate((to, from, next) => {
  const nextTaskId = String(to.query.taskId || to.query.k || '').trim()
  const prevTaskId = String(from.query.taskId || from.query.k || '').trim()
  if (nextTaskId && prevTaskId && nextTaskId !== prevTaskId && !confirmLeaveWhileBusy()) {
    next(false)
    return
  }
  next()
})

onBeforeRouteLeave((_to, _from, next) => {
  if (!confirmLeaveWhileBusy()) {
    next(false)
    return
  }
  next()
})

onUnmounted(() => {
  uploadPageAlive = false
  window.removeEventListener('beforeunload', onBeforeUnload)
  uploadQueue.value = []
  preparedUploads.value = {}
  pendingRetrySources.value = {}
  slotUploadStatus.value = {}
  closeUploadPreview()
  revokeAllLocalPreviews()
  if (flashTimer) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
  if (mileageFlashTimer) {
    clearTimeout(mileageFlashTimer)
    mileageFlashTimer = null
  }
})
</script>

<template>
  <div class="task-list-page">
    <input
      ref="addPhotoInputRef"
      type="file"
      accept="image/*"
      class="tl-file"
      tabindex="-1"
      aria-hidden="true"
      @change="onAddPhotoPickerChange"
    />
    <PageShell>
      <TopBrandBar :title="t.title" :back-to="backToHome" :back-label="t.back" />
      <main class="tl-main">
      <section class="tl-card">
        <h2 class="tl-card__head">{{ t.basicInfo }}</h2>
        <dl class="tl-basic">
          <div class="tl-basic__row"><dt>{{ t.train }}</dt><dd><input class="tl-readonly" :value="basicTrainNo" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.trainModel }}</dt><dd><input class="tl-readonly" :value="basicTrainModel" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.depot }}</dt><dd><input class="tl-readonly" :value="basicServiceLocation" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.maint }}</dt><dd><input class="tl-readonly" :value="basicMaintLabel" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.deadline }}</dt><dd><input class="tl-readonly" :value="basicDeadline" readonly /></dd></div>
          <div
            class="tl-basic__row"
            data-mileage-field
            :class="{ 'is-flash': mileageFlash }"
          >
            <dt>{{ t.mileage }}<span v-if="canEditWork" aria-hidden="true"> *</span></dt>
            <dd>
              <input
                v-model="mileageKmInput"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="off"
                class="tl-readonly"
                :class="{ 'tl-mileage-input': canEditWork, 'is-flash': mileageFlash }"
                :readonly="!canEditWork"
                :placeholder="canEditWork ? t.mileagePlaceholder : ''"
                :aria-required="canEditWork"
                @input="onMileageKmInput"
              />
            </dd>
          </div>
          <div class="tl-basic__row"><dt>{{ t.employee }}</dt><dd><input class="tl-readonly" :value="basicEmployeeId" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.taskid }}</dt><dd><input class="tl-readonly" :value="basicTaskId" readonly /></dd></div>
        </dl>
      </section>

      <section class="tl-card tl-card--subtasks">
        <header class="tl-card__head tl-card__head--subtasks">
          <h2 class="tl-card__head-title">{{ t.subtask }}</h2>
          <div class="tl-subtasks__progress" aria-live="polite">
            <span class="tl-subtasks__progress-text">{{ subtaskProgressText }}</span>
            <div
              class="tl-subtasks__progress-track"
              role="progressbar"
              :aria-valuenow="subtaskProgress.completed"
              :aria-valuemin="0"
              :aria-valuemax="subtaskProgress.total"
            >
              <div
                class="tl-subtasks__progress-bar"
                :style="{ width: `${subtaskProgress.percent}%` }"
              />
            </div>
          </div>
        </header>

        <div class="tl-subtask-list">
              <template v-for="(row, idx) in visibleRows" :key="row.id">
            <div v-if="isDataSyncStart(idx)" class="tl-section-break tl-section-break--card">
                      <strong>{{ lang === 'zh' ? '数据同步阶段' : 'Data Synchronization' }}</strong>
                      <span>{{ lang === 'zh' ? '以下为系统上传与同步步骤。' : 'The steps below are for upload and sync.' }}</span>
                    </div>

            <article
                  :data-row-id="row.id"
              class="tl-subtask-card"
              :class="{
                'is-expanded': isSubtaskExpanded(row.id),
                'is-done': rowWorkStatus(row) === 'done',
                'is-doing': rowWorkStatus(row) === 'doing',
                'is-todo': rowWorkStatus(row) === 'todo',
                'is-data-sync-row': isDataSyncRow(row),
                'is-flash': flashingRowId === row.id,
              }"
            >
              <button
                type="button"
                class="tl-subtask-card__summary"
                :aria-expanded="isSubtaskExpanded(row.id) ? 'true' : 'false'"
                @click="toggleSubtaskCard(row.id)"
              >
                <span
                  class="tl-subtask-card__seq"
                  :class="rowSeqClass(row)"
                >{{ row.displaySeq }}</span>
                <span class="tl-subtask-card__summary-main">
                  <span class="tl-subtask-card__name">{{ rowCardTitle(row) }}</span>
                  <span
                    v-if="!isSubtaskExpanded(row.id)"
                    class="tl-subtask-card__meta"
                  >{{ rowCollapsedMeta(row) }}</span>
                </span>
                <span class="tl-subtask-card__summary-end">
                  <span class="tl-subtask-card__status-stack">
                    <span
                      class="tl-subtask-card__status"
                      :class="rowCollapsedStatusClass(row)"
                    >{{ rowCollapsedStatusLabel(row) }}</span>
                    <span
                      v-if="!isSubtaskExpanded(row.id) && rowWorkStatus(row) !== 'done' && rowCollapsedIssueLabel(row)"
                      class="tl-subtask-card__issue-status"
                      :class="issueBtnClass(row.id)"
                    >{{ rowCollapsedIssueLabel(row) }}</span>
                  </span>
                  <span
                    class="tl-subtask-card__chevron"
                    aria-hidden="true"
                  />
                </span>
              </button>

              <div v-if="isSubtaskExpanded(row.id)" class="tl-subtask-card__body">
                <div class="tl-subtask-card__content-panel">
                  <p class="tl-subtask-card__desc">{{ rowDescription(row) }}</p>
                  <div class="tl-subtask-card__panel-footer">
                    <button
                      v-if="rowHasPicSample(row)"
                      type="button"
                      class="tl-subtask-card__help"
                      @click="openSchematicForRow(row)"
                    >{{ lang === 'zh' ? '获取帮助' : 'Get help' }}</button>
                  </div>
                </div>

                <div
                  v-if="rowNeedsEquipmentInputs(row)"
                  class="tl-equipment-fields tl-equipment-fields--card"
                >
                  <div class="tl-equipment-fields__pair">
                    <label
                      v-if="equipmentFlagsOf(row).materialNumber"
                      class="tl-equipment-field"
                      :class="{ 'is-flash': flashingEquipmentKey === `${row.id}:materialNumber` }"
                      :data-equipment-field="`${row.id}:materialNumber`"
                    >
                      <span>{{ equipmentFieldLabel('materialNumber') }}</span>
                      <input
                        type="text"
                        :value="equipmentValue(row.id, 'materialNumber')"
                        :placeholder="inputPlaceholder(row.materialNumberInput)"
                        :readonly="!canEditWork"
                        :disabled="!canEditWork"
                        @input="setEquipmentValue(row.id, 'materialNumber', ($event.target as HTMLInputElement).value)"
                      />
                    </label>
                    <label
                      v-if="equipmentFlagsOf(row).serialNumber"
                      class="tl-equipment-field"
                      :class="{ 'is-flash': flashingEquipmentKey === `${row.id}:serialNumber` }"
                      :data-equipment-field="`${row.id}:serialNumber`"
                    >
                      <span>{{ equipmentFieldLabel('serialNumber') }}</span>
                      <input
                        type="text"
                        :value="equipmentValue(row.id, 'serialNumber')"
                        :placeholder="inputPlaceholder(row.serialNumberInput)"
                        :readonly="!canEditWork"
                        :disabled="!canEditWork"
                        @input="setEquipmentValue(row.id, 'serialNumber', ($event.target as HTMLInputElement).value)"
                      />
                    </label>
                  </div>
                  <label
                    v-if="equipmentFlagsOf(row).overhaulOrManufactureDate"
                    class="tl-equipment-field tl-equipment-field--date"
                    :class="{ 'is-flash': flashingEquipmentKey === `${row.id}:overhaulOrManufactureDate` }"
                    :data-equipment-field="`${row.id}:overhaulOrManufactureDate`"
                  >
                    <span>{{ equipmentFieldLabel('overhaulOrManufactureDate') }}</span>
                    <span class="tl-equipment-field__control">
                      <input
                        type="date"
                        :value="equipmentDateInputValue(row.id)"
                        :min="equipmentDateMin"
                        :max="equipmentDateMax"
                        :readonly="!canEditWork"
                        :disabled="!canEditWork"
                        :aria-label="equipmentFieldLabel('overhaulOrManufactureDate')"
                        @change="setEquipmentValue(row.id, 'overhaulOrManufactureDate', ($event.target as HTMLInputElement).value)"
                      />
                      <button
                        type="button"
                        class="tl-equipment-field__cal"
                        :disabled="!canEditWork"
                        :aria-label="lang === 'zh' ? '打开日期选择' : 'Open date picker'"
                        @click.stop.prevent="openEquipmentDatePicker($event)"
                      />
                    </span>
                    <span
                      v-if="equipmentLegacyDateHint(row.id)"
                      class="tl-equipment-field__legacy"
                    >{{ equipmentLegacyDateHint(row.id) }}</span>
                  </label>
                </div>

                    <template v-if="row.buttons && row.buttons.length">
                  <p
                    v-if="rowIssueStatus(row.id) === 'no_equipment'"
                    class="tl-upload-optional-hint"
                  >
                    {{ lang === 'zh' ? '无此设备时无需上传照片' : 'No photo needed when there is no such equipment' }}
                  </p>
                  <p
                    v-else-if="(row.uploadRequiredWhen || 'always') === 'abnormal' && rowIssueStatus(row.id) !== 'abnormal'"
                    class="tl-upload-optional-hint"
                  >
                    {{ lang === 'zh' ? '检查正常时无需上传；发现异常时再上传照片' : 'No photo needed when OK; upload only if abnormal' }}
                  </p>
                  <div class="tl-upload-row tl-upload-row--card">
                    <template v-for="(btn, bi) in row.buttons" :key="btn.slot">
                      <div
                        class="tl-upload-tile"
                        :class="{ 'has-image': !!displayedUploadUrl(btn.slot) }"
                        >
                          <TaskUploadSlot
                            :slot-id="btn.slot"
                            :label="btn.label"
                            :input-id="`f-${btn.slot}-${bi}`"
                            :image-url="displayedUploadUrl(btn.slot)"
                            :status="slotStatusOf(btn.slot)"
                            :meta-title="uploadMetaTitle(btn.slot, btn.label)"
                            :meta-lines="uploadMetaLines(btn.slot)"
                            :disabled="!canEditWork"
                          :show-add-photo="false"
                          :show-remove="canEditWork && !!displayedUploadUrl(btn.slot)"
                            @change="handleUpload(btn.slot, btn.label, $event)"
                            @retry="retryUpload(btn.slot)"
                            @preview="openUploadPreview(btn.slot)"
                            @remove="removeSlotPhoto(btn.slot)"
                          />
                        <span
                          v-if="!displayedUploadUrl(btn.slot)"
                          class="tl-upload-tile__cap"
                        >{{ btn.label }}</span>
                      </div>
                      <div
                            v-for="extraId in extraSlotsForBase(btn.slot)"
                            :key="extraId"
                        class="tl-upload-tile has-image"
                      >
                        <TaskUploadSlot
                            :slot-id="extraId"
                            :label="uploadMetaTitle(extraId, btn.label)"
                            :input-id="`f-extra-${extraId}`"
                            :image-url="displayedUploadUrl(extraId)"
                            :status="slotStatusOf(extraId)"
                            :meta-title="uploadMetaTitle(extraId, btn.label)"
                            :meta-lines="uploadMetaLines(extraId)"
                            :disabled="!canEditWork"
                          :show-add-photo="false"
                            :show-remove="canEditWork"
                            @change="handleUpload(extraId, btn.label, $event)"
                            @retry="retryUpload(extraId)"
                            @preview="openUploadPreview(extraId)"
                            @remove="removeSlotPhoto(extraId)"
                          />
                        </div>
                    </template>
                      </div>
                  <button
                    v-if="rowAddExtraTarget(row)"
                    type="button"
                    class="tl-upload-add-more"
                    @click="onRowAddExtraPhoto(row)"
                  >{{ lang === 'zh' ? '添加照片' : 'Add photo' }}</button>
                    </template>
                <span v-else class="tl-upload-na tl-upload-na--card">{{ row.uploadHint || t.noUpload }}</span>

                <div class="tl-issue-wrap tl-issue-wrap--card">
                      <div v-if="issueNotePreview(row.id)" class="tl-issue-note">{{ issueNotePreview(row.id) }}</div>
                      <button
                        type="button"
                        class="tl-issue-btn"
                        :class="issueBtnClass(row.id)"
                        :disabled="!canEditWork"
                        @click="openIssue(row.id)"
                      >{{ t.reportIssue }}</button>
                    </div>
                  </div>
            </article>
              </template>
        </div>

        <div
          v-if="!isViewOnly"
          class="tl-actions tl-actions--sticky"
          :class="{ 'is-single': isTaskDone || isTaskRejected }"
        >
          <template v-if="isTaskDone">
            <button type="button" class="tl-btn tl-btn--primary tl-btn--full" @click="onEditRequest">{{ editRequestBtnText }}</button>
          </template>
          <template v-else-if="isTaskRejected">
            <p class="tl-reject-hint">{{ (t as any).rejectedHint }}</p>
            <button type="button" class="tl-btn tl-btn--primary tl-btn--full" @click="onAccept">{{ (t as any).accept || 'Accept' }}</button>
          </template>
          <template v-else-if="isTaskTodo">
            <button type="button" class="tl-btn tl-btn--secondary" @click="onReject">{{ (t as any).reject || 'Reject' }}</button>
            <button type="button" class="tl-btn tl-btn--primary" @click="onAccept">{{ (t as any).accept || 'Accept' }}</button>
          </template>
          <template v-else-if="isTaskDoing">
            <button type="button" class="tl-btn tl-btn--secondary" :disabled="savingDraft" @click="onSave">{{ savingDraft ? (lang === 'zh' ? '保存中...' : 'Saving...') : t.save }}</button>
            <button type="button" class="tl-btn tl-btn--primary" @click="onSubmit">{{ t.submit }}</button>
          </template>
        </div>
        <p v-else class="tl-viewonly-hint">{{ lang === 'zh' ? '经理只读查看，不可编辑' : 'Manager view-only. Editing is disabled.' }}</p>
      </section>
      </main>
    </PageShell>
  </div>

  <Teleport to="body">
    <div v-if="previewOpen" class="tl-modal-backdrop" role="presentation" @click.self="closeUploadPreview">
      <div class="tl-modal tl-modal--preview" role="dialog" aria-modal="true" :aria-label="lang === 'zh' ? '图片预览' : 'Image preview'">
        <div class="tl-modal__inner">
          <h3>{{ lang === 'zh' ? '图片预览' : 'Image preview' }}</h3>
          <figure class="tl-modal__fig tl-modal__fig--preview">
            <img :src="previewSrc" alt="" :style="{ transform: `scale(${previewZoom})` }" />
          </figure>
          <div class="tl-modal__tools">
            <button type="button" class="tl-modal__tool" :disabled="previewZoom <= 1" @click="setPreviewZoom(previewZoom - 0.25)">-</button>
            <span class="tl-modal__zoom">{{ Math.round(previewZoom * 100) }}%</span>
            <button type="button" class="tl-modal__tool" :disabled="previewZoom >= 4" @click="setPreviewZoom(previewZoom + 0.25)">+</button>
            <button type="button" class="tl-modal__tool tl-modal__tool--ghost" @click="setPreviewZoom(1)">{{ t.zoomReset }}</button>
          </div>
          <button type="button" class="tl-modal__close" @click="closeUploadPreview">{{ t.close }}</button>
        </div>
      </div>
    </div>

    <div v-if="schematicOpen" class="tl-modal-backdrop" role="presentation" @click.self="schematicOpen = false">
      <div class="tl-modal" role="dialog" aria-modal="true" :aria-label="t.schematicTitle">
        <div class="tl-modal__inner">
          <h3>{{ t.schematicTitle }}</h3>
          <figure
            ref="schematicFigRef"
            class="tl-modal__fig"
            :class="{ 'is-pannable': schematicZoom > 1, 'is-dragging': isSchematicDragging }"
            @pointerdown="onSchematicPointerDown"
            @pointermove="onSchematicPointerMove"
            @pointerup="onSchematicPointerUp"
            @pointercancel="onSchematicPointerUp"
          >
            <img :src="schematicSrc" alt="" :style="schematicImageStyle" />
          </figure>
          <div class="tl-modal__tools">
            <button type="button" class="tl-modal__tool" :disabled="schematicZoom <= 1" @click="zoomBy(-0.25)">-</button>
            <span class="tl-modal__zoom">{{ Math.round(schematicZoom * 100) }}%</span>
            <button type="button" class="tl-modal__tool" :disabled="schematicZoom >= 4" @click="zoomBy(0.25)">+</button>
            <button type="button" class="tl-modal__tool tl-modal__tool--ghost" @click="resetSchematicView">{{ t.zoomReset }}</button>
          </div>
          <button type="button" class="tl-modal__close" @click="schematicOpen = false; resetSchematicView()">{{ t.close }}</button>
        </div>
      </div>
    </div>

    <div v-if="issueOpen" class="tl-modal-backdrop" role="presentation" @click.self="issueOpen = false">
      <div class="tl-modal tl-modal--issue" role="dialog" aria-modal="true" :aria-label="t.issueDialogTitle">
        <div class="tl-modal__inner">
          <h3>{{ t.issueDialogTitle }}</h3>
          <p class="tl-issue-help">{{ t.issueDialogHelp }}</p>
          <p v-if="issueShowLogPcTip" class="tl-issue-help tl-issue-help--pc-tip">{{ t.issueDialogLogPcTip }}</p>
          <label class="tl-issue-field">
            <span class="tl-issue-field__label">{{ t.issueStatusPlaceholder }}</span>
            <select v-model="issueStatus" class="tl-issue-select" @change="onIssueStatusChange">
              <option value="ok">{{ t.issueStatusOk }}</option>
              <option value="abnormal">{{ t.issueStatusAbnormal }}</option>
              <option value="no_equipment">{{ t.issueStatusNoEquipment }}</option>
            </select>
          </label>
          <label v-if="issueAbnormalFields" class="tl-issue-field">
            <span class="tl-issue-field__label">{{ t.issueSeverityPlaceholder }}</span>
            <select v-model="issueSeverity" class="tl-issue-select">
              <option value="">{{ t.issueSeverityPlaceholder }}</option>
              <option
                v-for="level in ABNORMAL_SEVERITY_OPTIONS"
                :key="level"
                :value="level"
              >{{ severityOptionLabel(level) }}</option>
            </select>
          </label>
          <textarea
            v-if="issueDetailRequired"
            v-model="issueText"
            class="tl-issue-text"
            :placeholder="issuePlaceholderText"
          ></textarea>
          <div class="tl-issue-actions">
            <button type="button" class="tl-issue-action tl-issue-action--ghost" @click="issueOpen = false">{{ t.issueCancel }}</button>
            <button type="button" class="tl-issue-action tl-issue-action--primary" @click="saveIssue">{{ t.issueSave }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="submitConfirmOpen" class="tl-modal-backdrop" role="presentation" @click.self="submitConfirmOpen = false">
      <div class="tl-modal tl-modal--issue" role="dialog" aria-modal="true" :aria-label="lang === 'zh' ? '未完成上传确认' : 'Incomplete upload confirmation'">
        <div class="tl-modal__inner">
          <h3>{{ lang === 'zh' ? '仍有子任务未上传完成' : 'Some subtasks are still missing uploads' }}</h3>
          <p class="tl-issue-help">
            {{ lang === 'zh' ? '以下子任务仍有必填照片未上传。请确认是否继续提交：' : 'The following subtasks still have required photos missing. Please confirm whether to submit anyway:' }}
          </p>
          <ul class="tl-submit-missing-list">
            <li v-for="row in incompleteRows" :key="row.id" class="tl-submit-missing-item">
              <strong>{{ row.displaySeq }}</strong>
              <span>{{ rowDescription(row) }}</span>
            </li>
          </ul>
          <div class="tl-issue-actions">
            <button type="button" class="tl-issue-action tl-issue-action--ghost" @click="submitConfirmOpen = false">
              {{ lang === 'zh' ? '返回补传' : 'Back to upload' }}
            </button>
            <button type="button" class="tl-issue-action tl-issue-action--primary" @click="confirmSubmitWithMissingUploads">
              {{ lang === 'zh' ? '仍然提交' : 'Submit anyway' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="abnormalitySummaryOpen"
      class="tl-modal-backdrop"
      role="presentation"
      @click.self="!submittingTask && (abnormalitySummaryOpen = false)"
    >
      <div
        class="tl-modal tl-modal--issue tl-modal--summary"
        role="dialog"
        aria-modal="true"
        :aria-label="t.abnormalitySummaryTitle"
      >
        <div class="tl-modal__inner">
          <h3>{{ t.abnormalitySummaryTitle }}</h3>
          <div class="tl-abnormality-summary">
            <p
              v-for="(line, idx) in abnormalitySummaryLines"
              :key="idx"
              class="tl-abnormality-summary__line"
            >{{ line }}</p>
          </div>
          <div class="tl-issue-actions">
            <button
              type="button"
              class="tl-issue-action tl-issue-action--ghost"
              :disabled="submittingTask"
              @click="abnormalitySummaryOpen = false"
            >{{ t.abnormalitySummaryBack }}</button>
            <button
              type="button"
              class="tl-issue-action tl-issue-action--primary"
              :disabled="submittingTask"
              @click="confirmAbnormalitySummarySubmit"
            >{{ t.abnormalitySummaryConfirm }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="editRequestOpen" class="tl-modal-backdrop" role="presentation" @click.self="!editRequestSubmitting && (editRequestOpen = false)">
      <div class="tl-modal tl-modal--issue" role="dialog" aria-modal="true" :aria-label="lang === 'zh' ? '编辑申请' : 'Edit Request'">
        <div class="tl-modal__inner">
          <h3>{{ editRequestBtnText }}</h3>
          <p class="tl-issue-help">
            {{ lang === 'zh' ? '请填写修改原因，提交后将发送给管理员审批。' : 'Please provide the reason. The request will be sent for review.' }}
          </p>
          <textarea
            v-model="editRequestReason"
            class="tl-issue-text"
            :placeholder="lang === 'zh' ? '请输入修改原因' : 'Enter reason'"
          ></textarea>
          <div class="tl-issue-actions">
            <button type="button" class="tl-issue-action tl-issue-action--ghost" :disabled="editRequestSubmitting" @click="editRequestOpen = false">
              {{ lang === 'zh' ? '取消' : 'Cancel' }}
            </button>
            <button type="button" class="tl-issue-action tl-issue-action--primary" :disabled="editRequestSubmitting" @click="submitEditRequest">
              {{ editRequestSubmitting ? (lang === 'zh' ? '提交中...' : 'Submitting...') : (lang === 'zh' ? '提交申请' : 'Submit Request') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<style scoped>
.task-list-page :deep(.page) {
  background: transparent;
}
</style>
<style>
@import '@/assets/styles/task-list.css';
</style>
