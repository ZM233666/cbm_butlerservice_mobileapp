<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'
import { createClientId } from '@/utils/id'
import { createWorkOrder, setWorkOrderStatus } from '@/api/workOrders'
import { fetchHomeConfig, fetchTaskStatus } from '@/api/tasks'
import type { TaskCard, TaskStatusStore } from '@/types/task'

type TaskTemplate = 'c1c3' | 'c4c6' | 'custom'
type TaskStatus = 'todo' | 'doing' | 'done'

interface TaskCenterTask {
  id: string
  title: string
  template: TaskTemplate
  month: string
  trainModel: string
  requiredAttachments: number
  uploadedAttachments: number
  status: TaskStatus
  createdAt: string
  completedAt?: string
  serviceCity?: string
  endDate?: string
}

function nowMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const auth = useAuthStore()
const { lang, t } = useI18n()
const selectedMonth = ref(nowMonth())
const toast = ref('')
const todayMin = computed(() => todayIso())
const adding = ref(false)

const form = ref({
  template: 'c1c3' as TaskTemplate,
  customName: '',
  trainModel: '',
  requiredAttachments: 19,
  serviceCity: '',
  endDate: '',
})

const TASK_KEY = computed(() => `butler.task-center.${auth.user?.employeeId || 'guest'}`)

function readTasks(): TaskCenterTask[] {
  try {
    const raw = localStorage.getItem(TASK_KEY.value)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeTasks(list: TaskCenterTask[]) {
  try { localStorage.setItem(TASK_KEY.value, JSON.stringify(list)) } catch { /* ignore */ }
}

const tasks = ref<TaskCenterTask[]>(readTasks())

function seedIfEmpty() {
  if (tasks.value.length > 0) return
  const m = nowMonth()
  tasks.value = [
    {
      id: createClientId('seed'),
      title: 'C1～C3 Service',
      template: 'c1c3',
      month: m,
      trainModel: 'HXD1',
      requiredAttachments: 19,
      uploadedAttachments: 19,
      status: 'done',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    {
      id: createClientId('seed'),
      title: 'C4～C6 Service',
      template: 'c4c6',
      month: m,
      trainModel: 'HXD3',
      requiredAttachments: 45,
      uploadedAttachments: 26,
      status: 'doing',
      createdAt: new Date().toISOString(),
    },
  ]
  writeTasks(tasks.value)
}

seedIfEmpty()

watch(() => form.value.template, (v) => {
  if (v === 'c1c3') form.value.requiredAttachments = 19
  else if (v === 'c4c6') form.value.requiredAttachments = 45
  else form.value.requiredAttachments = Math.max(0, form.value.requiredAttachments || 0)
})

watch(() => form.value.endDate, (v) => {
  const text = String(v || '').trim()
  if (!text) return
  // yyyy-mm-dd 字符串可直接字典序比较
  if (text < todayMin.value) form.value.endDate = todayMin.value
})

const homeCards = ref<TaskCard[]>([])
const statusStore = ref<TaskStatusStore>({})
function taskKey(card: TaskCard) {
  return String((card as any).taskId || '').trim() || `${card.maint}-${card.title}-${card.deadline}`
}

function getStatusFromEntry(entry: unknown): TaskStatus | null {
  const e = entry as { status?: unknown } | null
  const s = e?.status
  if (s === 'todo' || s === 'doing' || s === 'done') return s
  return null
}

const maintCounts = computed(() => {
  const map: Record<string, number> = {}
  homeCards.value.forEach((c) => {
    const k = String(c.maint || '').toLowerCase()
    map[k] = (map[k] || 0) + 1
  })
  return map
})

function getCardStatusByCard(card: TaskCard): TaskStatus {
  const key = taskKey(card)
  const byKey = getStatusFromEntry(statusStore.value[key])
  if (byKey) return byKey
  const maint = String(card.maint || '').toLowerCase()
  if ((maintCounts.value[maint] || 0) <= 1) {
    const byMaint = getStatusFromEntry(statusStore.value[maint])
    if (byMaint) return byMaint
  }
  return 'todo'
}

function monthOfCard(card: TaskCard): string {
  const text = String(card.deadline || '')
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7)
  return ''
}

function formatModelLabel(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return 'N/A'
  const k = text.replace(/[\s\-_/]/g, '').toUpperCase()
  if (k === 'C1C3') return 'C1/C3'
  if (k === 'C4C6') return 'C4/C6'
  return text.toUpperCase()
}

const monthCards = computed(() => homeCards.value.filter((x) => monthOfCard(x) === selectedMonth.value))

function guessTrainModel(card: TaskCard): string {
  const title = String(card.title || '').trim()
  const hit = title.match(/[A-Za-z]{2,}\d+(?:-\d+)?/)
  if (hit) return formatModelLabel(hit[0])
  return formatModelLabel(String(card.maint || ''))
}

const completedServices = computed(() => monthCards.value.filter(x => getCardStatusByCard(x) === 'done').length)
const todoServices = computed(() => monthCards.value.filter(x => getCardStatusByCard(x) === 'todo').length)
const doingServices = computed(() => monthCards.value.filter(x => getCardStatusByCard(x) === 'doing').length)
const totalServices = computed(() => monthCards.value.length)

const canAddTask = computed(() => {
  if (adding.value) return false
  // 基础必填：修程、车号、服务城市、结束日期
  const templateOk = !!String(form.value.template || '').trim()
  const trainOk = !!String(form.value.trainModel || '').trim()
  const cityOk = !!String(form.value.serviceCity || '').trim()
  const endOk = !!String(form.value.endDate || '').trim()
  if (!templateOk || !trainOk || !cityOk || !endOk) return false
  if (String(form.value.endDate || '').trim() < todayMin.value) return false

  // 自定义模板时，自定义名称也必须填写
  if (form.value.template === 'custom' && !String(form.value.customName || '').trim()) return false

  return true
})

const monthStatusByMonth = computed(() => {
  const map: Record<string, 'none' | 'ok' | 'warn'> = {}
  const byMonth = new Map<string, TaskCard[]>()
  homeCards.value.forEach((t) => {
    const key = monthOfCard(t)
    if (!key) return
    const arr = byMonth.get(key) || []
    arr.push(t)
    byMonth.set(key, arr)
  })
  byMonth.forEach((arr, key) => {
    if (!arr.length) return
    const hasIncomplete = arr.some((x) => getCardStatusByCard(x) !== 'done')
    map[key] = hasIncomplete ? 'warn' : 'ok'
  })
  return map
})

const trainStats = computed(() => {
  const map = new Map<string, number>()
  monthCards.value.forEach((x) => {
    const key = guessTrainModel(x)
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count)
})

const attachmentStats = computed(() => {
  const uploaded = monthCards.value.reduce((s, x) => s + Number(x.uploadProgress?.uploaded || 0), 0)
  const required = monthCards.value.reduce((s, x) => s + Number(x.uploadProgress?.required || 0), 0)
  const percent = required > 0 ? Math.round((uploaded / required) * 100) : 0
  return { uploaded, required, percent }
})

async function loadActionSource() {
  const employeeId = String(auth.user?.employeeId || '').trim()
  if (!employeeId) {
    homeCards.value = []
    statusStore.value = {}
    return
  }
  try {
    const [cfg, statusResp] = await Promise.all([
      fetchHomeConfig(employeeId),
      fetchTaskStatus(employeeId),
    ])
    homeCards.value = Array.isArray(cfg?.tasks) ? cfg.tasks : []
    statusStore.value = statusResp?.statuses || {}
  } catch {
    homeCards.value = []
    statusStore.value = {}
  }
}

onMounted(() => {
  loadActionSource()
})

watch(
  () => auth.user?.employeeId || '',
  () => { loadActionSource() },
  { immediate: true },
)

function taskStatusLabel(s: TaskStatus) {
  if (s === 'done') return t.value.tcStatusDone
  if (s === 'doing') return t.value.tcStatusDoing
  return t.value.tcStatusTodo
}

function templateTitle(tp: TaskTemplate) {
  if (tp === 'c1c3') return t.value.tcTemplateC1C3
  if (tp === 'c4c6') return t.value.tcTemplateC4C6
  return t.value.tcTemplateCustom
}

function yesNoLabel(v?: boolean) {
  return v ? t.value.tcYes : t.value.tcNo
}

async function addTask() {
  if (adding.value) return
  if (!canAddTask.value) return
  const employeeId = auth.user?.employeeId || ''
  if (!employeeId) return
  adding.value = true
  const name = form.value.template === 'custom'
    ? form.value.customName.trim()
    : `${templateTitle(form.value.template)} Service`
  if (!name) { adding.value = false; return }
  const task: TaskCenterTask = {
    id: createClientId('task'),
    title: name,
    template: form.value.template,
    month: selectedMonth.value,
    trainModel: form.value.trainModel.trim() || 'N/A',
    requiredAttachments: Math.max(0, Number(form.value.requiredAttachments) || 0),
    uploadedAttachments: 0,
    // 需求：Task Centre 自建任务直接进入 Doing（跳过 To Do）
    status: 'doing',
    createdAt: new Date().toISOString(),
    serviceCity: form.value.serviceCity.trim() || undefined,
    endDate: form.value.endDate || undefined,
  }
  tasks.value = [task, ...tasks.value]
  writeTasks(tasks.value)
  try {
    const maint = form.value.template === 'c1c3' ? 'c1c3' : (form.value.template === 'c4c6' ? 'c4c6' : 'c4c6')
    const vehicleNo = form.value.trainModel.trim()
    const deadline = form.value.endDate
    const depot = form.value.serviceCity.trim()
    const resp = await createWorkOrder({
      assignedToEmployeeId: employeeId,
      maint,
      vehicleNo,
      deadline,
      title: name,
      depot,
      createdBy: { employeeId: auth.user?.employeeId || '', name: auth.user?.username || '' },
    })
    const id = resp?.workOrder?.id
    if (id) {
      // 需求：Task Centre 自建任务直接进入 Doing（跳过 To Do）
      await setWorkOrderStatus(id, 'doing')
    }
    await loadActionSource()
    toast.value = t.value.tcAdded
    setTimeout(() => { toast.value = '' }, 1800)
  } catch {
    toast.value = lang.value === 'zh' ? '创建工单失败' : 'Failed to create work order'
    setTimeout(() => { toast.value = '' }, 1800)
  }
  form.value.customName = ''
  form.value.trainModel = ''
  form.value.serviceCity = ''
  form.value.endDate = ''
  // 稍微延迟释放锁，避免极端情况下的连点与视觉抖动
  setTimeout(() => { adding.value = false }, 450)
}

</script>

<template>
  <PageShell>
    <TopBrandBar :title="t.tcTitle" />
    <main class="main tc-main">
      <section class="tc-card">
        <label class="tc-month">
          <span>{{ t.tcMonth }}</span>
          <MonthPicker v-model="selectedMonth" :status-by-month="monthStatusByMonth" />
        </label>
      </section>

      <section class="tc-card">
        <h2 class="tc-title">{{ t.tcWorkload }}</h2>
        <div class="tc-kpis tc-kpis--summary">
          <article class="tc-kpi tc-kpi--all">
            <p class="tc-kpi__label">{{ t.tcAllTaskCount }}</p>
            <p class="tc-kpi__value">{{ totalServices }}</p>
          </article>
          <article class="tc-kpi tc-kpi--todo">
            <p class="tc-kpi__label">{{ t.tcTodoCount }}</p>
            <p class="tc-kpi__value">{{ todoServices }}</p>
          </article>
          <article class="tc-kpi tc-kpi--doing">
            <p class="tc-kpi__label">{{ t.tcDoingCount }}</p>
            <p class="tc-kpi__value">{{ doingServices }}</p>
          </article>
          <article class="tc-kpi tc-kpi--done">
            <p class="tc-kpi__label">{{ t.tcCompleted }}</p>
            <p class="tc-kpi__value">{{ completedServices }}</p>
          </article>
          <article class="tc-kpi tc-kpi--models">
            <p class="tc-kpi__label">{{ t.tcModelCount }}</p>
            <p class="tc-kpi__value">{{ trainStats.length }}</p>
          </article>
          <article class="tc-kpi tc-kpi--attach">
            <p class="tc-kpi__label">{{ t.tcAttachProgress }}</p>
            <p class="tc-kpi__value">{{ attachmentStats.percent }}%</p>
          </article>
        </div>
        <div class="tc-workload-panel">
          <div class="tc-list">
            <p v-for="row in trainStats" :key="row.model" class="tc-list__item">{{ row.model }} × {{ row.count }}</p>
          </div>
          <p class="tc-attach">{{ t.tcUploaded }}: {{ attachmentStats.uploaded }} / {{ attachmentStats.required }}</p>
          <div class="tc-progress" role="meter" :aria-valuenow="attachmentStats.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="t.tcAttachProgress">
            <div class="tc-progress__bar" :style="{ width: `${attachmentStats.percent}%` }"></div>
          </div>
        </div>
      </section>

      <section class="tc-card">
        <h2 class="tc-title">{{ t.tcAddSelfTask }}</h2>
        <div class="tc-form">
          <section class="tc-step" aria-label="Step 1">
            <header class="tc-step__head">
              <span class="tc-step__no" aria-hidden="true">1</span>
              <div class="tc-step__copy">
                <p class="tc-step__title">{{ lang === 'zh' ? '选车与位置' : 'Vehicle & Location' }}</p>
                <p class="tc-step__sub">{{ lang === 'zh' ? '车号 / 地点' : 'Train No. / Service Location' }}</p>
              </div>
            </header>
            <div class="tc-step__fields">
              <label><span>{{ t.tcServiceCity }}</span><input v-model="form.serviceCity" :placeholder="lang === 'zh' ? '如：上海机务段' : 'e.g. Shanghai Depot'" /></label>
              <label><span>{{ t.tcTrainModel }}</span><input v-model="form.trainModel" :placeholder="t.tcTrainPlaceholder" /></label>
            </div>
          </section>

          <section class="tc-step" aria-label="Step 2">
            <header class="tc-step__head">
              <span class="tc-step__no" aria-hidden="true">2</span>
              <div class="tc-step__copy">
                <p class="tc-step__title">{{ lang === 'zh' ? '选标准' : 'Standard' }}</p>
                <p class="tc-step__sub">{{ lang === 'zh' ? '维保级别 / 自动带出检查项' : 'Maintenance level / Auto checklist' }}</p>
              </div>
            </header>
            <div class="tc-step__fields tc-step__fields--standard">
              <label class="tc-step__field--maintenance">
                <span>{{ t.tcTemplate }}</span>
                <select v-model="form.template">
                  <option value="c1c3">{{ t.tcTemplateC1C3 }}</option>
                  <option value="c4c6">{{ t.tcTemplateC4C6 }}</option>
                  <option value="custom">{{ t.tcTemplateCustom }}</option>
                </select>
              </label>
              <span class="tc-step__pill tc-step__pill--inline" :title="lang === 'zh' ? '自动带出检查项数量' : 'Auto checklist count'">
                {{ lang === 'zh' ? `检查项 ${form.requiredAttachments} 项` : `${form.requiredAttachments} items` }}
              </span>
              <label v-if="form.template === 'custom'" class="tc-step__field--full"><span>{{ t.tcCustomName }}</span><input v-model="form.customName" :placeholder="t.tcCustomPlaceholder" /></label>
            </div>
          </section>

          <section class="tc-step" aria-label="Step 3">
            <header class="tc-step__head">
              <span class="tc-step__no" aria-hidden="true">3</span>
              <div class="tc-step__copy">
                <p class="tc-step__title">{{ lang === 'zh' ? '定时间并确认' : 'Schedule & Confirm' }}</p>
                <p class="tc-step__sub">{{ lang === 'zh' ? '选择日期后提交' : 'Pick a date then submit' }}</p>
              </div>
            </header>
            <div class="tc-step__fields">
              <label><span>{{ t.tcEndDate }}</span><input v-model="form.endDate" type="date" :min="todayMin" /></label>
            </div>
            <button
              type="button"
              class="tc-add"
              :class="{ 'is-loading': adding }"
              :disabled="!canAddTask"
              :aria-busy="adding ? 'true' : 'false'"
              @click="addTask"
            >
              <span v-if="adding" class="tc-add__spinner" aria-hidden="true"></span>
              {{ adding ? t.tcAdding : t.tcAddBtn }}
            </button>
          </section>
        </div>
      </section>
    </main>

    <div class="tc-toast" :class="{ 'is-show': toast }" role="status">{{ toast }}</div>
  </PageShell>
</template>

<style scoped>
.tc-main { display: flex; flex-direction: column; gap: 0.8rem; padding: 0.95rem 1rem 0.8rem; }
.tc-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 0.8rem; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06); }
.tc-title {
  margin: 0 0 0.72rem;
  font-size: 1.02rem;
  line-height: 1.2;
  letter-spacing: -0.015em;
  color: #0b4a82;
  font-weight: 800;
}
.tc-month {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.84rem;
  line-height: 1.25;
  letter-spacing: -0.01em;
  font-weight: 760;
  color: #24476f;
}
.tc-month :deep(.mp) { flex: 0 0 30%; width: 30%; max-width: 30%; min-width: 0; }
.tc-month :deep(.mp__control) { width: 100%; }
.tc-kpis { display: grid; gap: 0.5rem; }
.tc-kpis--summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tc-kpi {
  border-radius: 0.9rem;
  padding: 0.56rem 0.6rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 5rem;
  border: 1px solid #dbe7f5;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}
.tc-kpi__label {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.3;
  letter-spacing: 0.01em;
  font-weight: 650;
}
.tc-kpi__value {
  margin: 0;
  font-size: 1.34rem;
  font-weight: 820;
  line-height: 1;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}
.tc-kpi--all,
.tc-kpi--todo,
.tc-kpi--doing,
.tc-kpi--done,
.tc-kpi--models,
.tc-kpi--attach { background: #f7faff; }
.tc-kpi--all .tc-kpi__label,
.tc-kpi--todo .tc-kpi__label,
.tc-kpi--doing .tc-kpi__label,
.tc-kpi--done .tc-kpi__label,
.tc-kpi--models .tc-kpi__label,
.tc-kpi--attach .tc-kpi__label { color: #5b6b80; }
.tc-kpi--all .tc-kpi__value,
.tc-kpi--todo .tc-kpi__value,
.tc-kpi--doing .tc-kpi__value,
.tc-kpi--done .tc-kpi__value,
.tc-kpi--models .tc-kpi__value,
.tc-kpi--attach .tc-kpi__value { color: #0b4a82; }
.tc-kpi--all { border-left: 3px solid #7aa7dc; }
.tc-kpi--todo { border-left: 3px solid #8eb4e0; }
.tc-kpi--doing { border-left: 3px solid #5e95d4; }
.tc-kpi--done { border-left: 3px solid #2f74c0; }
.tc-kpi--models { border-left: 3px solid #9cbde3; }
.tc-kpi--attach { border-left: 3px solid #6b9fd9; }
.tc-workload-panel {
  margin-top: 0.62rem;
  padding: 0.6rem 0.62rem;
  border-radius: 0.85rem;
  border: 1px solid #dbe7f5;
  background: #f7faff;
}
.tc-list { display: flex; flex-wrap: wrap; gap: 0.38rem; }
.tc-list__item {
  margin: 0;
  padding: 0.24rem 0.52rem;
  border-radius: 999px;
  background: #edf3fb;
  color: #315c8f;
  font-size: 0.72rem;
  line-height: 1.2;
  letter-spacing: 0.005em;
  font-weight: 700;
  border: 1px solid #dae6f4;
  font-variant-numeric: tabular-nums;
}
.tc-attach {
  margin: 0.62rem 0 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #42556d;
  font-weight: 600;
}
.tc-progress { margin-top: 0.4rem; width: 100%; height: 0.58rem; border-radius: 999px; background: #e6edf7; overflow: hidden; }
.tc-progress__bar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #3c86d2 0%, #2f74c0 100%); transition: width 0.25s ease; }
.tc-form { display: grid; grid-template-columns: 1fr; gap: 0.7rem; }
.tc-form label { display: grid; gap: 0.2rem; font-size: 0.72rem; color: #475569; }
.tc-form input, .tc-form select { min-height: 2.15rem; border-radius: 10px; border: 1px solid #cbd5e1; padding: 0.35rem 0.55rem; font: inherit; font-size: 0.82rem; color: #0f172a; background: #fff; }

.tc-step {
  border: 1px solid #dbe7f5;
  border-radius: 0.95rem;
  background: #f7faff;
  padding: 0.62rem 0.62rem 0.7rem;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
}

.tc-step__head {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-bottom: 0.55rem;
}

.tc-step__no {
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 900;
  color: #0b4a82;
  background: #eaf2fb;
  border: 1px solid rgba(47, 116, 192, 0.18);
  flex: 0 0 auto;
}

.tc-step__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.tc-step__title {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.2;
  font-weight: 850;
  color: #0b4a82;
  letter-spacing: -0.01em;
}

.tc-step__sub {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  line-height: 1.3;
  color: #5b6b80;
  font-weight: 650;
}

.tc-step__pill {
  flex: 0 0 auto;
  margin-top: 0.05rem;
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(255,255,255,0.85);
  color: #334155;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.tc-step__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.tc-step__fields label {
  font-size: 0.72rem;
}

.tc-step__fields--standard {
  align-items: end;
}

.tc-step__field--maintenance {
  min-width: 0;
}

.tc-step__field--maintenance select {
  width: 100%;
}

.tc-step__field--full {
  grid-column: 1 / -1;
}

.tc-step__pill--inline {
  justify-self: start;
  align-self: end;
  margin-top: 0;
  height: 2.15rem;
  display: inline-flex;
  align-items: center;
}
.tc-add {
  margin-top: 0.6rem;
  /* 避免小屏被底部导航栏遮挡 */
  margin-bottom: calc(var(--bottom-nav-h, 3.5rem) * 0.35 + env(safe-area-inset-bottom, 0px) + 0.35rem);
  min-height: 2.5rem;
  width: 100%;
  border-radius: 999px;
  border: 1px solid #0b4a82;
  background: #0b4a82;
  color: #fff;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 760;
  cursor: pointer;
}
.tc-add:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.05); }
.tc-add.is-loading { opacity: 0.92; cursor: progress; }
.tc-add__spinner {
  display: inline-block;
  width: 0.95rem;
  height: 0.95rem;
  margin-right: 0.45rem;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.55);
  border-top-color: rgba(255,255,255,1);
  animation: tc-spin 0.9s linear infinite;
  vertical-align: -2px;
}
@keyframes tc-spin { to { transform: rotate(360deg); } }
.tc-toast { position: fixed; left: 50%; bottom: max(1rem, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%) translateY(120%); background: rgba(24, 24, 27, 0.92); color: #fff; padding: 0.55rem 1rem; border-radius: 999px; font-size: 0.8rem; font-weight: 650; z-index: 10120; transition: transform 0.22s ease; pointer-events: none; opacity: 0; }
.tc-toast.is-show { transform: translateX(-50%) translateY(0); opacity: 1; }
@media (max-width: 420px) {
  .tc-step__fields { grid-template-columns: 1fr; }
  .tc-kpis--summary { grid-template-columns: 1fr; }
}
</style>

