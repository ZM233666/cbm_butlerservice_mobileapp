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
}

function nowMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const auth = useAuthStore()
const { t } = useI18n()
const selectedMonth = ref(nowMonth())
const toast = ref('')

const form = ref({
  template: 'c1c3' as TaskTemplate,
  customName: '',
  trainModel: '',
  team: 'A',
  requiredAttachments: 19,
  hours: 8,
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

const monthTasks = computed(() => tasks.value.filter(x => x.month === selectedMonth.value))
const completedServices = computed(() => monthTasks.value.filter(x => x.status === 'done').length)

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

function addTask() {
  const name = form.value.template === 'custom'
    ? form.value.customName.trim()
    : `${templateTitle(form.value.template)} Service`
  if (!name) return
  const task: TaskCenterTask = {
    id: createClientId('task'),
    title: name,
    template: form.value.template,
    month: selectedMonth.value,
    trainModel: form.value.trainModel.trim() || 'N/A',
    team: form.value.team,
    requiredAttachments: Math.max(0, Number(form.value.requiredAttachments) || 0),
    uploadedAttachments: 0,
    status: 'todo',
    hours: Math.max(0.5, Number(form.value.hours) || 1),
    createdAt: new Date().toISOString(),
  }
  tasks.value = [task, ...tasks.value]
  writeTasks(tasks.value)
  toast.value = t.value.tcAdded
  setTimeout(() => { toast.value = '' }, 1800)
  form.value.customName = ''
  form.value.trainModel = ''
}

function addUpload(task: TaskCenterTask) {
  if (task.uploadedAttachments < task.requiredAttachments) task.uploadedAttachments += 1
  if (task.status === 'todo') task.status = 'doing'
  writeTasks(tasks.value)
}

function markDone(task: TaskCenterTask) {
  task.status = 'done'
  task.completedAt = new Date().toISOString()
  writeTasks(tasks.value)
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
          <label><span>{{ t.tcTeamField }}</span>
            <select v-model="form.team">
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>
          <label><span>{{ t.tcRequiredAttach }}</span><input v-model.number="form.requiredAttachments" type="number" min="0" /></label>
          <label><span>{{ t.tcHoursField }}</span><input v-model.number="form.hours" type="number" min="0.5" step="0.5" /></label>
        </div>
        <button type="button" class="tc-add" @click="addTask">{{ t.tcAddBtn }}</button>
      </section>

      <section class="tc-card">
        <h2 class="tc-title">{{ t.tcMyTasks }}</h2>
        <div v-if="monthTasks.length" class="tc-tasks">
          <article v-for="task in monthTasks" :key="task.id" class="tc-task">
            <div class="tc-task__top">
              <h3>{{ task.title }}</h3>
              <span class="tc-status">{{ taskStatusLabel(task.status) }}</span>
            </div>
            <p class="tc-meta">{{ t.tcTrainModel }}: {{ task.trainModel }} · {{ t.tcTeam }} {{ task.team }} · {{ t.tcHours }} {{ task.hours }}</p>
            <p class="tc-meta">{{ t.tcUploaded }}: {{ task.uploadedAttachments }} / {{ task.requiredAttachments }}</p>
            <div class="tc-actions">
              <button type="button" @click="addUpload(task)">{{ t.tcAddUpload }}</button>
              <button type="button" :disabled="task.status === 'done'" @click="markDone(task)">{{ t.tcMarkDone }}</button>
            </div>
          </article>
        </div>
        <p v-else class="tc-empty">{{ t.tcNoTasks }}</p>
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
.tc-table { border: 1px solid #e2e8f0; border-radius: 0.8rem; overflow: hidden; }
.tc-table__head, .tc-table__row { display: grid; grid-template-columns: minmax(2.5rem, 1fr) minmax(5rem, 1fr) minmax(6.5rem, 1.1fr); gap: 0.65rem; padding: 0.5rem 1rem 0.5rem 0.7rem; font-size: 0.76rem; align-items: center; }
.tc-table__head { background: #f8fafc; color: #334155; font-weight: 700; }
.tc-table__row { border-top: 1px solid #e2e8f0; color: #0f172a; }
.tc-table__head > span,
.tc-table__row > span { justify-self: start; text-align: left; min-width: 0; }
.tc-empty { margin: 0; font-size: 0.78rem; color: #64748b; }
.tc-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
.tc-form label { display: grid; gap: 0.2rem; font-size: 0.72rem; color: #475569; }
.tc-form input, .tc-form select { min-height: 2.15rem; border-radius: 10px; border: 1px solid #cbd5e1; padding: 0.35rem 0.55rem; font: inherit; font-size: 0.82rem; color: #0f172a; background: #fff; }
.tc-add { margin-top: 0.6rem; min-height: 2.5rem; width: 100%; border-radius: 999px; border: 1px solid #0b4a82; background: #0b4a82; color: #fff; font: inherit; font-size: 0.84rem; font-weight: 760; cursor: pointer; }
.tc-tasks { display: grid; gap: 0.55rem; }
.tc-task { border: 1px solid #e2e8f0; border-radius: 0.8rem; padding: 0.58rem 0.6rem; background: #fff; }
.tc-task__top { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.tc-task__top h3 { margin: 0; font-size: 0.84rem; color: #0f172a; }
.tc-status { padding: 0.12rem 0.45rem; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 0.67rem; font-weight: 700; white-space: nowrap; }
.tc-meta { margin: 0.35rem 0 0; font-size: 0.72rem; color: #475569; }
.tc-actions { margin-top: 0.45rem; display: flex; gap: 0.45rem; }
.tc-actions button { min-height: 2rem; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; color: #1f2937; font: inherit; font-size: 0.72rem; font-weight: 700; padding: 0 0.65rem; cursor: pointer; }
.tc-actions button:disabled { opacity: 0.45; cursor: default; }
.tc-toast { position: fixed; left: 50%; bottom: max(1rem, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%) translateY(120%); background: rgba(24, 24, 27, 0.92); color: #fff; padding: 0.55rem 1rem; border-radius: 999px; font-size: 0.8rem; font-weight: 650; z-index: 10120; transition: transform 0.22s ease; pointer-events: none; opacity: 0; }
.tc-toast.is-show { transform: translateX(-50%) translateY(0); opacity: 1; }
@media (max-width: 420px) { .tc-form { grid-template-columns: 1fr; } .tc-kpis { grid-template-columns: 1fr; } }
</style>

