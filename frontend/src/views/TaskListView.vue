<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import TaskUploadSlot from '@/components/task/TaskUploadSlot.vue'
import { fetchGuidanceTasks, fetchTaskStatus, postTaskStatus, postTaskSubmit, postTaskEditRequest, fetchLatestTaskSubmit } from '@/api/tasks'
import { uploadImage } from '@/api/upload'
import type { UploadResult } from '@/api/upload'
import type { GuidanceRow } from '@/types/task'
import * as exifr from 'exifr'

defineOptions({ name: 'TaskListView' })

let guidanceRowsMemoryCache: GuidanceRow[] | null = null

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { lang, t } = useI18n()

const SCHEMATIC_SEQS = new Set(['1','2','3','3.1','3.2','3.3','4','5','5.1','6','6.1','7','8','8.1','8.2','9','9.1','10','11','11.1','12','13','14','15','17.1','17.2','17.3','17.4','17.5','17.6'])

const maintType = ref<'c4c6' | 'c1c3'>('c4c6')
const guidanceRows = ref<GuidanceRow[]>([])
const uploadRecords = ref<Record<string, { url: string; capture?: UploadResult['capture'] }>>({})
const localPreviewRecords = ref<Record<string, string>>({})
const uploadingSlots = ref<Record<string, boolean>>({})
const issueRecords = ref<Record<string, { text: string; updatedAt: string }>>({})
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

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
const issueText = ref('')
const submitConfirmOpen = ref(false)
const currentTaskStatus = ref<'todo' | 'doing' | 'done'>('todo')
const taskRejected = ref(false)
const editRequestOpen = ref(false)
const editRequestReason = ref('')
const editRequestSubmitting = ref(false)
// taskKey：统一以 Main Task ID 作为唯一 key（来自 query.k / query.taskId）
const taskKey = computed(() => String(route.query.k || route.query.taskId || '').trim())
const fallbackTaskKey = computed(() => {
  const title = String(route.query.title || '').trim()
  const deadline = String(route.query.deadline || '').trim()
  if (!title || !deadline) return ''
  // 与首页 taskKey() 保持一致，maint 统一小写
  return `${maintType.value.toLowerCase()}-${title}-${deadline}`
})

const mainTaskId = computed(() => String(route.query.taskId || '').trim() || 'MT-CCBII-88421')
const effectiveTaskKey = computed(() => mainTaskId.value || taskKey.value || fallbackTaskKey.value)
const deadlineTextRaw = computed(() => String(route.query.deadline || '2026-04-30').trim())
const homeRefreshStamp = ref(0)
const backToHome = computed(() => {
  if (!homeRefreshStamp.value) return '/'
  return { path: '/', query: { refresh: String(homeRefreshStamp.value) } }
})

const visibleRows = computed(() => {
  return guidanceRows.value.filter(row => {
    if (maintType.value === 'c1c3') return !(row.scopeTags.length === 1 && row.scopeTags[0] === 'c4c6')
    if (maintType.value === 'c4c6') return !(row.scopeTags.length === 1 && row.scopeTags[0] === 'c1c3')
    return true
  })
})

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
  const seq = String(row.seq || '')
  return seq === '17' || seq.startsWith('17.')
}

function isDataSyncStart(index: number) {
  const row = visibleRows.value[index]
  if (!row || !isDataSyncRow(row)) return false
  if (index === 0) return true
  return !isDataSyncRow(visibleRows.value[index - 1])
}

const colLabels = computed(() => {
  if (lang.value === 'zh') return { seq: '序号', desc: '操作说明', upload: '上传图片' }
  return { seq: 'No.', desc: 'Instructions', upload: 'Upload' }
})

const requiredSlots = computed(() => {
  const slots = new Set<string>()
  visibleRows.value.forEach(row => {
    (row.buttons || []).forEach(b => { if (b.slot) slots.add(b.slot) })
  })
  return Array.from(slots)
})
const incompleteSlots = computed(() => requiredSlots.value.filter(s => !uploadRecords.value[s]?.url))
const isSubmitReady = computed(() => incompleteSlots.value.length === 0)

const incompleteRows = computed(() => {
  return visibleRows.value.filter((row) => {
    const buttons = row.buttons || []
    if (!buttons.length) return false
    return buttons.some((b) => !uploadRecords.value[b.slot]?.url)
  })
})
const isTaskDone = computed(() => currentTaskStatus.value === 'done')
const isTaskTodo = computed(() => currentTaskStatus.value === 'todo')
const isTaskDoing = computed(() => currentTaskStatus.value === 'doing')
const editRequestBtnText = computed(() => {
  const dict = t.value as Record<string, string>
  return dict.editRequestBtn || (lang.value === 'zh' ? '编辑申请' : 'Edit Request')
})
const editRequestSentText = computed(() => {
  const dict = t.value as Record<string, string>
  return dict.editRequestSent || (lang.value === 'zh' ? '编辑申请已提交' : 'Edit request submitted')
})

function toast(msg: string) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2200)
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

function openSchematic(seq: string) {
  schematicSrc.value = `/PicSamples/${encodeURIComponent(seq)}.png`
  resetSchematicView()
  schematicOpen.value = true
}

function openIssue(rowId: string) {
  issueRowId.value = rowId
  issueText.value = issueRecords.value[rowId]?.text || ''
  issueOpen.value = true
}

function saveIssue() {
  if (!issueRowId.value) return
  const text = issueText.value.trim()
  if (text) {
    issueRecords.value[issueRowId.value] = { text, updatedAt: new Date().toISOString() }
    toast(t.value.issueSaved)
  } else {
    delete issueRecords.value[issueRowId.value]
    toast(t.value.issueCleared)
  }
  issueOpen.value = false
}

type ClientCaptureMeta = { capturedAt: string; latitude?: number; longitude?: number; accuracy?: number }

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

function uploadMetaLines(slotId: string) {
  return captureLines(uploadRecords.value[slotId]?.capture)
}

function taskListCacheKey() {
  return `butler.task-list.${auth.user?.employeeId || 'guest'}.${mainTaskId.value}`
}

function readTaskListCache() {
  try {
    const raw = sessionStorage.getItem(taskListCacheKey())
    return raw ? JSON.parse(raw) as {
      uploadRecords?: Record<string, { url: string; capture?: UploadResult['capture'] }>
      issueRecords?: Record<string, { text: string; updatedAt: string }>
      currentTaskStatus?: 'todo' | 'doing' | 'done'
      taskRejected?: boolean
      maintType?: 'c4c6' | 'c1c3'
    } : null
  } catch {
    return null
  }
}

function persistTaskListCache() {
  try {
    sessionStorage.setItem(taskListCacheKey(), JSON.stringify({
      uploadRecords: uploadRecords.value,
      issueRecords: issueRecords.value,
      currentTaskStatus: currentTaskStatus.value,
      taskRejected: taskRejected.value,
      maintType: maintType.value,
    }))
  } catch { /* ignore quota / private mode */ }
}

function clearTaskListCache() {
  try {
    sessionStorage.removeItem(taskListCacheKey())
  } catch { /* ignore */ }
}

async function hydrateTaskPage() {
  const m = route.query.maint as string
  if (m === 'c1c3') maintType.value = 'c1c3'
  else if (m === 'c4c6') maintType.value = 'c4c6'

  uploadRecords.value = {}
  issueRecords.value = {}
  Object.keys(localPreviewRecords.value).forEach((slotId) => cleanupLocalPreview(slotId))

  const cached = readTaskListCache()
  if (cached) {
    if (cached.uploadRecords && typeof cached.uploadRecords === 'object') {
      uploadRecords.value = cached.uploadRecords
    }
    if (cached.issueRecords && typeof cached.issueRecords === 'object') {
      issueRecords.value = cached.issueRecords
    }
    if (cached.currentTaskStatus === 'todo' || cached.currentTaskStatus === 'doing' || cached.currentTaskStatus === 'done') {
      currentTaskStatus.value = cached.currentTaskStatus
    }
    if (typeof cached.taskRejected === 'boolean') taskRejected.value = cached.taskRejected
    if (cached.maintType === 'c1c3' || cached.maintType === 'c4c6') maintType.value = cached.maintType
  }

  if (guidanceRowsMemoryCache?.length) {
    guidanceRows.value = guidanceRowsMemoryCache
  } else if (!guidanceRows.value.length) {
    try {
      const data = await fetchGuidanceTasks()
      guidanceRows.value = data.rows || []
      guidanceRowsMemoryCache = guidanceRows.value
    } catch { toast('Load failed') }
  }

  if (auth.user?.employeeId) {
    try {
      const statusData = await fetchTaskStatus(auth.user.employeeId)
      const entry = effectiveTaskKey.value
        ? statusData?.statuses?.[effectiveTaskKey.value]
        : statusData?.statuses?.[maintType.value]
      if (entry && (entry.status === 'todo' || entry.status === 'doing' || entry.status === 'done')) {
        currentTaskStatus.value = entry.status
        taskRejected.value = entry.status === 'todo' && Boolean((entry as any).rejected)
      }
    } catch { /* */ }
  }

  if (mainTaskId.value && Object.keys(uploadRecords.value).length === 0) {
    try {
      const latest = await fetchLatestTaskSubmit(mainTaskId.value)
      const uploads = latest && latest.found && latest.uploads && typeof latest.uploads === 'object' ? latest.uploads : {}
      Object.entries(uploads).forEach(([slot, item]) => {
        const url = String((item as any)?.url || '').trim()
        if (!url) return
        uploadRecords.value[slot] = {
          url,
          capture: (item as any)?.capture,
        }
      })
      persistTaskListCache()
    } catch {
      // ignore: keep page usable even when no historical submit available
    }
  }
}

function displayedUploadUrl(slotId: string) {
  return uploadRecords.value[slotId]?.url || localPreviewRecords.value[slotId] || ''
}

function cleanupLocalPreview(slotId: string) {
  const previewUrl = localPreviewRecords.value[slotId]
  if (previewUrl && previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
  delete localPreviewRecords.value[slotId]
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

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // 小文件直接上传，避免额外前处理开销
  if (file.size <= 1.2 * 1024 * 1024) return file
  try {
    const filenameBase = String(file.name || 'upload').replace(/\.[^.]+$/, '') || 'upload'
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file)
      try {
        return await imageBitmapToJpegFile(bitmap, filenameBase)
      } finally {
        bitmap.close()
      }
    }
    const srcUrl = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image_decode_failed'))
        img.src = srcUrl
      })
      const MAX_EDGE = 1920
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
      if (!blob) return file
      return new File([blob], `${filenameBase}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
    } finally {
      URL.revokeObjectURL(srcUrl)
    }
  } catch {
    return file
  }
}

async function handleUpload(slotId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const previewUrl = URL.createObjectURL(file)
  cleanupLocalPreview(slotId)
  localPreviewRecords.value[slotId] = previewUrl
  uploadingSlots.value[slotId] = true
  persistTaskListCache()
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  try {
    const uploadFile = await compressImageForUpload(file)
    const geoPromise = isGeoFresh() ? Promise.resolve(lastGeo) : getGeo(2500)
    const exifMeta = await readExifMeta(file)
    const geo = (exifMeta.latitude != null && exifMeta.longitude != null) ? null : await geoPromise
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

    const data = await uploadImage(slotId, uploadFile, slotId, clientMeta)
    uploadRecords.value[slotId] = { url: data.url, capture: data.capture }
    cleanupLocalPreview(slotId)
    persistTaskListCache()
  } catch {
    toast(t.value.uploadFail)
    cleanupLocalPreview(slotId)
    input.value = ''
  } finally {
    uploadingSlots.value[slotId] = false
  }
}

async function setTaskStatus(status: string, opts?: { rejected?: boolean }): Promise<boolean> {
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
        rejected: opts?.rejected,
      },
    ) as any
    if (data && data.ok === false) return false
    if (data && data.status && data.status !== status) return false
    return true
  } catch {
    return false
  }
}

async function onSave() {
  const ok = await setTaskStatus('doing')
  if (ok) currentTaskStatus.value = 'doing'
  toast(ok ? t.value.savedToDoing : t.value.saved)
  if (ok) homeRefreshStamp.value = Date.now()
}

async function onAccept() {
  const ok = await setTaskStatus('doing', { rejected: false })
  if (ok) {
    currentTaskStatus.value = 'doing'
    taskRejected.value = false
    homeRefreshStamp.value = Date.now()
  }
  toast(ok ? (t.value as any).acceptedToDoing : t.value.saved)
}

async function onReject() {
  const ok = await setTaskStatus('todo', { rejected: true })
  if (!ok) {
    toast((t.value as any).rejectFailed || (lang.value === 'zh' ? '拒绝失败，请稍后重试' : 'Reject failed. Please try again.'))
    return
  }
  taskRejected.value = true
  currentTaskStatus.value = 'todo'
  homeRefreshStamp.value = Date.now()
  toast((t.value as any).rejected || (lang.value === 'zh' ? '已拒绝，该任务仍保留在 To Do' : 'Rejected. Task stays in To Do'))
  await wait(700)
  router.push({ path: '/', query: { refresh: String(homeRefreshStamp.value) } })
}

async function onSubmit() {
  if (!isSubmitReady.value) { submitConfirmOpen.value = true; return }
  try {
    await postTaskSubmit({ basicInfo: { maintenanceType: maintType.value, employeeId: auth.user?.employeeId, taskId: mainTaskId.value }, uploads: uploadRecords.value, issues: issueRecords.value })
    const doneUpdated = await setTaskStatus('done')
    if (!doneUpdated) { toast('Submit succeeded, but Done status sync failed'); return }
    currentTaskStatus.value = 'done'
    clearTaskListCache()
    toast(t.value.submitted)
    await wait(900)
    homeRefreshStamp.value = Date.now()
    router.push({ path: '/', query: { refresh: String(homeRefreshStamp.value) } })
  } catch { toast('Submit failed') }
}

async function confirmSubmitWithMissingUploads() {
  submitConfirmOpen.value = false
  try {
    await postTaskSubmit({ basicInfo: { maintenanceType: maintType.value, employeeId: auth.user?.employeeId, taskId: mainTaskId.value }, uploads: uploadRecords.value, issues: issueRecords.value })
    const doneUpdated = await setTaskStatus('done')
    if (!doneUpdated) { toast('Submit succeeded, but Done status sync failed'); return }
    currentTaskStatus.value = 'done'
    clearTaskListCache()
    toast(t.value.submitted)
    await wait(900)
    homeRefreshStamp.value = Date.now()
    router.push({ path: '/', query: { refresh: String(homeRefreshStamp.value) } })
  } catch { toast('Submit failed') }
}

function onEditRequest() {
  editRequestReason.value = ''
  editRequestOpen.value = true
}

async function submitEditRequest() {
  const reason = editRequestReason.value.trim()
  if (!reason) {
    toast(lang.value === 'zh' ? '请先填写修改原因' : 'Please provide a reason')
    return
  }
  const employeeId = auth.user?.employeeId || ''
  if (!employeeId) {
    toast(lang.value === 'zh' ? '缺少员工信息，无法提交申请' : 'Missing employee info')
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
        toast(lang.value === 'zh' ? '编辑申请已提交，任务状态已切换为 Doing' : 'Edit request submitted. Task moved to Doing.')
      } else {
        toast(lang.value === 'zh' ? '编辑申请接口不可用，已按测试流程切换为 Doing' : 'Edit API unavailable. Task moved to Doing for testing.')
      }
      return
    }

    toast(
      requestSaved
        ? (lang.value === 'zh' ? '编辑申请已提交，但状态切换失败' : 'Edit request submitted, but failed to switch status.')
        : (lang.value === 'zh' ? '编辑申请与状态切换均失败' : 'Edit request and status switch both failed.'),
    )
  } catch {
    toast(lang.value === 'zh' ? '处理失败，请稍后重试' : 'Process failed, please try again.')
  } finally {
    editRequestSubmitting.value = false
  }
}

onMounted(() => {
  hydrateTaskPage()
})

watch(mainTaskId, (next, prev) => {
  if (next && next !== prev) hydrateTaskPage()
})

watch([uploadRecords, issueRecords, currentTaskStatus, taskRejected, maintType], () => {
  persistTaskListCache()
}, { deep: true })

onUnmounted(() => {
  Object.keys(localPreviewRecords.value).forEach((slotId) => cleanupLocalPreview(slotId))
})
</script>

<template>
  <div class="task-list-page">
    <PageShell>
      <TopBrandBar :title="t.title" :back-to="backToHome" :back-label="t.back" />
      <main class="tl-main">
      <section class="tl-card">
        <h2 class="tl-card__head">{{ t.basicInfo }}</h2>
        <dl class="tl-basic">
          <div class="tl-basic__row"><dt>{{ t.depot }}</dt><dd><input class="tl-readonly" value="Shanghai" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.train }}</dt><dd><input class="tl-readonly" value="HXD1-1234" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.employee }}</dt><dd><input class="tl-readonly" :value="auth.user?.employeeId || ''" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.maint }}</dt><dd><input class="tl-readonly" :value="maintType === 'c1c3' ? t.maintC1C3 : t.maintC4C6" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.taskid }}</dt><dd><input class="tl-readonly" :value="mainTaskId" readonly /></dd></div>
          <div class="tl-basic__row"><dt>{{ t.deadline }}</dt><dd><input class="tl-readonly" :value="deadlineTextRaw" readonly /></dd></div>
        </dl>
      </section>

      <section class="tl-card">
        <h2 class="tl-card__head">{{ t.subtask }}</h2>
        <p class="tl-hint">{{ t.filterHint }} ({{ visibleRows.length }})</p>
        <div class="tl-table-wrap">
          <table class="tl-table">
            <thead><tr><th>{{ colLabels.seq }}</th><th>{{ colLabels.desc }}</th><th>{{ colLabels.upload }}</th></tr></thead>
            <tbody>
              <template v-for="(row, idx) in visibleRows" :key="row.id">
                <tr v-if="isDataSyncStart(idx)" class="tl-section-break-row">
                  <td colspan="3">
                    <div class="tl-section-break">
                      <strong>{{ lang === 'zh' ? '数据同步阶段' : 'Data Synchronization' }}</strong>
                      <span>{{ lang === 'zh' ? '以下为系统上传与同步步骤。' : 'The steps below are for upload and sync.' }}</span>
                    </div>
                  </td>
                </tr>
                <tr :class="{ 'is-data-sync-row': isDataSyncRow(row) }">
                <td class="tl-seq-cell">{{ row.seq }}</td>
                <td class="tl-desc-cell">
                  <span class="tl-desc-text">{{ rowDescription(row) }}</span>
                  <button v-if="SCHEMATIC_SEQS.has(row.seq)" type="button" class="tl-desc-btn tl-desc-btn--inline" @click="openSchematic(row.seq)">{{ lang === 'zh' ? '查看位置示意图' : 'View schematic' }}</button>
                </td>
                <td class="tl-upload-cell">
                  <div class="tl-upload-stack">
                    <template v-if="row.buttons && row.buttons.length">
                      <div :class="row.buttons.length > 1 ? 'tl-upload-row' : ''">
                        <TaskUploadSlot
                          v-for="(btn, bi) in row.buttons"
                          :key="btn.slot"
                          :slot-id="btn.slot"
                          :label="btn.label"
                          :input-id="`f-${btn.slot}-${bi}`"
                          :image-url="displayedUploadUrl(btn.slot)"
                          :uploading="!!uploadingSlots[btn.slot]"
                          :meta-lines="uploadMetaLines(btn.slot)"
                          @change="handleUpload(btn.slot, $event)"
                        />
                      </div>
                    </template>
                    <span v-else class="tl-upload-na">{{ row.uploadHint || t.noUpload }}</span>
                    <div class="tl-issue-wrap">
                      <div v-if="issueRecords[row.id]?.text" class="tl-issue-note">{{ t.issueNotePrefix }}{{ issueRecords[row.id].text.slice(0, 44) }}{{ issueRecords[row.id].text.length > 44 ? '...' : '' }}</div>
                      <button type="button" class="tl-issue-btn" @click="openIssue(row.id)">{{ t.reportIssue }}</button>
                    </div>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="tl-actions tl-actions--sticky" :class="{ 'is-single': isTaskDone }">
          <p v-if="isTaskTodo && taskRejected" class="tl-reject-hint">{{ (t as any).rejectedHint }}</p>
          <template v-if="isTaskDone">
            <button type="button" class="tl-btn tl-btn--primary tl-btn--full" @click="onEditRequest">{{ editRequestBtnText }}</button>
          </template>
          <template v-else>
            <template v-if="isTaskTodo">
              <button type="button" class="tl-btn tl-btn--secondary" :disabled="taskRejected" @click="onReject">{{ taskRejected ? ((t as any).rejectedBtn || '已拒绝') : ((t as any).reject || 'Reject') }}</button>
              <button type="button" class="tl-btn tl-btn--primary" @click="onAccept">{{ (t as any).accept || 'Accept' }}</button>
            </template>
            <template v-else-if="isTaskDoing">
              <button type="button" class="tl-btn tl-btn--secondary" @click="onSave">{{ t.save }}</button>
              <button type="button" class="tl-btn tl-btn--primary" @click="onSubmit">{{ t.submit }}</button>
            </template>
          </template>
        </div>
      </section>
      </main>
    </PageShell>
  </div>

  <Teleport to="body">
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
          <textarea v-model="issueText" class="tl-issue-text" :placeholder="t.issuePlaceholder"></textarea>
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
              <strong>{{ row.seq }}</strong>
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
            :placeholder="lang === 'zh' ? '请输入修改原因（必填）' : 'Enter reason (required)'"
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

  <div class="tl-toast" :class="{ 'is-show': toastMsg }" role="status" aria-live="polite">{{ toastMsg }}</div>
</template>

<style scoped>
.task-list-page :deep(.page) {
  background: transparent;
}
</style>
<style>
@import '@/assets/styles/task-list.css';
</style>
