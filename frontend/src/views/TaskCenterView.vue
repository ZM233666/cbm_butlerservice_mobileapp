<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'
import { createClientId } from '@/utils/id'

type TaskTemplate = 'c1c3' | 'c4c6' | 'custom'
type TaskStatus = 'todo' | 'doing' | 'done'

interface TaskCenterTask {
  id: string
  title: string
  template: TaskTemplate
  month: string
  trainModel: string
  team: string
  requiredAttachments: number
  uploadedAttachments: number
  status: TaskStatus
  hours: number
  createdAt: string
  completedAt?: string
  serviceCity?: string
  endDate?: string
  isSeconded?: boolean
  secondCity?: string
  secondStartDate?: string
  secondEndDate?: string
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
  hours: 8,
  serviceCity: '',
  endDate: '',
  isSeconded: false,
  secondCity: '',
  secondStartDate: '',
  secondEndDate: '',
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
      team: 'A',
      requiredAttachments: 19,
      uploadedAttachments: 19,
      status: 'done',
      hours: 7.5,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    {
      id: createClientId('seed'),
      title: 'C4～C6 Service',
      template: 'c4c6',
      month: m,
      trainModel: 'HXD3',
      team: 'B',
      requiredAttachments: 45,
      uploadedAttachments: 26,
      status: 'doing',
      hours: 9.5,
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

watch(() => form.value.isSeconded, (v) => {
  if (v) return
  form.value.secondCity = ''
  form.value.secondStartDate = ''
  form.value.secondEndDate = ''
})

watch(() => form.value.endDate, (v) => {
  const text = String(v || '').trim()
  if (!text) return
  // yyyy-mm-dd 字符串可直接字典序比较
  if (text < todayMin.value) form.value.endDate = todayMin.value
})

watch(() => form.value.secondStartDate, (v) => {
  const start = String(v || '').trim()
  const end = String(form.value.secondEndDate || '').trim()
  if (!end) return
  if (start && end < start) form.value.secondEndDate = ''
})

const secondEndMin = computed(() => {
  const start = String(form.value.secondStartDate || '').trim()
  return start || todayMin.value
})

const monthTasks = computed(() => tasks.value.filter(x => x.month === selectedMonth.value))
const completedServices = computed(() => monthTasks.value.filter(x => x.status === 'done').length)

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

  // 借调时额外必填：临时借调城市 / 借调开始日期 / 借调结束日期
  if (form.value.isSeconded) {
    const secCityOk = !!String(form.value.secondCity || '').trim()
    const secStartOk = !!String(form.value.secondStartDate || '').trim()
    const secEndOk = !!String(form.value.secondEndDate || '').trim()
    if (!secCityOk || !secStartOk || !secEndOk) return false
    const start = String(form.value.secondStartDate || '').trim()
    const end = String(form.value.secondEndDate || '').trim()
    if (start && end && end < start) return false
  }

  return true
})

const monthStatusByMonth = computed(() => {
  const map: Record<string, 'none' | 'ok' | 'warn'> = {}
  const byMonth = new Map<string, TaskCenterTask[]>()
  tasks.value.forEach((t) => {
    if (!t.month) return
    const key = String(t.month).slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) return
    const arr = byMonth.get(key) || []
    arr.push(t)
    byMonth.set(key, arr)
  })
  byMonth.forEach((arr, key) => {
    if (!arr.length) return
    const hasIncomplete = arr.some((x) => x.status !== 'done')
    map[key] = hasIncomplete ? 'warn' : 'ok'
  })
  return map
})

const trainStats = computed(() => {
  const map = new Map<string, number>()
  monthTasks.value.forEach((x) => {
    const key = x.trainModel || 'N/A'
    map.set(key, (map.get(key) || 0) + 1)
  })
  return Array.from(map.entries()).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count)
})

const attachmentStats = computed(() => {
  const uploaded = monthTasks.value.reduce((s, x) => s + x.uploadedAttachments, 0)
  const required = monthTasks.value.reduce((s, x) => s + x.requiredAttachments, 0)
  const percent = required > 0 ? Math.round((uploaded / required) * 100) : 0
  return { uploaded, required, percent }
})

const crossTeamRows = computed(() => {
  const map = new Map<string, { count: number; hours: number }>()
  monthTasks.value.filter(x => x.team !== 'A').forEach((x) => {
    const prev = map.get(x.team) || { count: 0, hours: 0 }
    prev.count += 1
    prev.hours += x.hours
    map.set(x.team, prev)
  })
  return Array.from(map.entries()).map(([team, v]) => ({ team, count: v.count, hours: Number(v.hours.toFixed(1)) }))
})

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

function addTask() {
  if (adding.value) return
  if (!canAddTask.value) return
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
    // NOTE: 兼容旧统计字段（跨团队统计仍依赖 team/hours）
    team: form.value.isSeconded ? 'TEMP' : 'A',
    requiredAttachments: Math.max(0, Number(form.value.requiredAttachments) || 0),
    uploadedAttachments: 0,
    // 需求：Task Centre 自建任务直接进入 Doing（跳过 To Do）
    status: 'doing',
    hours: Math.max(0.5, Number(form.value.hours) || 1),
    createdAt: new Date().toISOString(),
    serviceCity: form.value.serviceCity.trim() || undefined,
    endDate: form.value.endDate || undefined,
    isSeconded: !!form.value.isSeconded,
    secondCity: form.value.secondCity.trim() || undefined,
    secondStartDate: form.value.secondStartDate || undefined,
    secondEndDate: form.value.secondEndDate || undefined,
  }
  tasks.value = [task, ...tasks.value]
  writeTasks(tasks.value)
  toast.value = t.value.tcAdded
  setTimeout(() => { toast.value = '' }, 1800)
  form.value.customName = ''
  form.value.trainModel = ''
  form.value.serviceCity = ''
  form.value.endDate = ''
  form.value.isSeconded = false
  form.value.secondCity = ''
  form.value.secondStartDate = ''
  form.value.secondEndDate = ''
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
        <div class="tc-kpis">
          <article class="tc-kpi">
            <p class="tc-kpi__label">{{ t.tcCompleted }}</p>
            <p class="tc-kpi__value">{{ completedServices }}</p>
          </article>
          <article class="tc-kpi">
            <p class="tc-kpi__label">{{ t.tcModelCount }}</p>
            <p class="tc-kpi__value">{{ trainStats.length }}</p>
          </article>
          <article class="tc-kpi">
            <p class="tc-kpi__label">{{ t.tcAttachProgress }}</p>
            <p class="tc-kpi__value">{{ attachmentStats.percent }}%</p>
          </article>
        </div>
        <div class="tc-list">
          <p v-for="row in trainStats" :key="row.model" class="tc-list__item">{{ row.model }} × {{ row.count }}</p>
        </div>
        <p class="tc-attach">{{ t.tcUploaded }}: {{ attachmentStats.uploaded }} / {{ attachmentStats.required }}</p>
        <div class="tc-progress" role="meter" :aria-valuenow="attachmentStats.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="t.tcAttachProgress">
          <div class="tc-progress__bar" :style="{ width: `${attachmentStats.percent}%` }"></div>
        </div>
      </section>

      <section class="tc-card">
        <h2 class="tc-title">{{ t.tcCrossTeam }}</h2>
        <div v-if="crossTeamRows.length" class="tc-table">
          <div class="tc-table__head">
            <span>{{ t.tcTeam }}</span><span>{{ t.tcServices }}</span><span>{{ t.tcHours }}</span>
          </div>
          <div v-for="row in crossTeamRows" :key="row.team" class="tc-table__row">
            <span>{{ row.team }}</span><span>{{ row.count }}</span><span>{{ row.hours }}</span>
          </div>
        </div>
        <p v-else class="tc-empty">{{ t.tcNoCrossTeam }}</p>
      </section>

      <section class="tc-card">
        <h2 class="tc-title">{{ t.tcAddSelfTask }}</h2>
        <div class="tc-form">
          <label><span>{{ t.tcTemplate }}</span>
            <select v-model="form.template">
              <option value="c1c3">{{ t.tcTemplateC1C3 }}</option>
              <option value="c4c6">{{ t.tcTemplateC4C6 }}</option>
              <option value="custom">{{ t.tcTemplateCustom }}</option>
            </select>
          </label>
          <label v-if="form.template === 'custom'"><span>{{ t.tcCustomName }}</span><input v-model="form.customName" :placeholder="t.tcCustomPlaceholder" /></label>
          <label><span>{{ t.tcTrainModel }}</span><input v-model="form.trainModel" :placeholder="t.tcTrainPlaceholder" /></label>
          <label><span>{{ t.tcServiceCity }}</span><input v-model="form.serviceCity" :placeholder="lang === 'zh' ? '如：上海机务段' : 'e.g. Shanghai Depot'" /></label>
          <label><span>{{ t.tcEndDate }}</span><input v-model="form.endDate" type="date" :min="todayMin" /></label>
          <label class="tc-form__row3"><span>{{ t.tcTeamField }}</span>
            <select v-model="form.isSeconded">
              <option :value="false">{{ t.tcNo }}</option>
              <option :value="true">{{ t.tcYes }}</option>
            </select>
          </label>
          <label :class="{ 'is-disabled': !form.isSeconded }">
            <span>{{ t.tcRequiredAttach }}</span>
            <input v-model="form.secondCity" :disabled="!form.isSeconded" :placeholder="lang === 'zh' ? '如：上海机务段' : 'e.g. Shanghai Depot'" />
          </label>
          <label :class="{ 'is-disabled': !form.isSeconded }">
            <span>{{ t.tcHoursField }}</span>
            <input v-model="form.secondStartDate" :disabled="!form.isSeconded" type="date" :min="todayMin" />
          </label>
          <label :class="{ 'is-disabled': !form.isSeconded }">
            <span>{{ t.tcSecondEndDate }}</span>
            <input v-model="form.secondEndDate" :disabled="!form.isSeconded" type="date" :min="secondEndMin" />
          </label>
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
    </main>

    <div class="tc-toast" :class="{ 'is-show': toast }" role="status">{{ toast }}</div>
  </PageShell>
</template>

<style scoped>
.tc-main { display: flex; flex-direction: column; gap: 0.8rem; padding: 0.95rem 1rem 0.8rem; }
.tc-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; padding: 0.8rem; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06); }
.tc-title { margin: 0 0 0.6rem; font-size: 0.98rem; color: #0b4a82; font-weight: 760; }
.tc-month { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; font-size: 0.8rem; font-weight: 700; color: #334155; }
.tc-month :deep(.mp) { flex: 0 0 30%; width: 30%; max-width: 30%; min-width: 0; }
.tc-month :deep(.mp__control) { width: 100%; }
.tc-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
.tc-kpi { border: 1px solid #dbeafe; border-radius: 0.8rem; background: #f8fbff; padding: 0.5rem; display: flex; flex-direction: column; justify-content: space-between; min-height: 5.1rem; }
.tc-kpi__label { margin: 0; font-size: 0.68rem; color: #64748b; line-height: 1.25; }
.tc-kpi__value { margin: 0; font-size: 1.15rem; color: #0b4a82; font-weight: 800; line-height: 1; }
.tc-list { margin-top: 0.55rem; display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tc-list__item { margin: 0; padding: 0.2rem 0.45rem; border-radius: 999px; background: #eff6ff; color: #1e3a8a; font-size: 0.72rem; font-weight: 650; }
.tc-attach { margin: 0.55rem 0 0; font-size: 0.78rem; color: #334155; }
.tc-progress { margin-top: 0.35rem; width: 100%; height: 0.55rem; border-radius: 999px; background: rgba(226,232,240,0.9); overflow: hidden; }
.tc-progress__bar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #0066b3 0%, #00467f 100%); transition: width 0.25s ease; }
.tc-table { border: 1px solid #e2e8f0; border-radius: 0.8rem; overflow: hidden; }
.tc-table__head, .tc-table__row { display: grid; grid-template-columns: minmax(2.5rem, 1fr) minmax(5rem, 1fr) minmax(6.5rem, 1.1fr); gap: 0.65rem; padding: 0.5rem 1rem 0.5rem 0.7rem; font-size: 0.76rem; align-items: center; }
.tc-table__head { background: #f8fafc; color: #334155; font-weight: 700; }
.tc-table__row { border-top: 1px solid #e2e8f0; color: #0f172a; }
.tc-table__head > span,
.tc-table__row > span { justify-self: start; text-align: left; min-width: 0; }
.tc-empty { margin: 0; font-size: 0.78rem; color: #64748b; }
.tc-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
.tc-form label { display: grid; gap: 0.2rem; font-size: 0.72rem; color: #475569; }
.tc-form__row3 { margin-top: 0.25rem; }
.tc-form label.is-disabled { opacity: 0.62; }
.tc-form label.is-disabled input,
.tc-form label.is-disabled select {
  background: #f1f5f9;
  color: #64748b;
}
.tc-form input, .tc-form select { min-height: 2.15rem; border-radius: 10px; border: 1px solid #cbd5e1; padding: 0.35rem 0.55rem; font: inherit; font-size: 0.82rem; color: #0f172a; background: #fff; }
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
@media (max-width: 420px) { .tc-form { grid-template-columns: 1fr; } .tc-kpis { grid-template-columns: 1fr; } }
</style>

