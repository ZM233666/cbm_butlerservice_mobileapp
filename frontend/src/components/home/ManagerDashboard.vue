<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchManagerDashboard } from '@/api/manager'
import type {
  ManagerAssignment,
  ManagerDashboard,
  ManagerReport,
  ManagerVehicle,
} from '@/types/manager'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'
import { formatMaintLabel } from '@/utils/maint'

type DashTab = 'mine' | 'all'
type ProgressFilter = 'all' | 'done' | 'doing'

const { t } = useI18n()
const router = useRouter()

const activeTab = ref<DashTab>('mine')
const month = ref(new Date().toISOString().slice(0, 7))
const hintKey = ref('')
const hintErr = ref(false)
const progressFilter = ref<ProgressFilter>('all')

const overviewTotal = ref(0)
const overviewTodo = ref(0)
const overviewDoing = ref(0)
const overviewDone = ref(0)
const monthlyTotal = ref(0)
const progressDone = ref(0)
const progressDoing = ref(0)
const progressTotal = ref(0)
const progressPct = ref(0)
const vehicles = ref<ManagerVehicle[]>([])
const reports = ref<ManagerReport[]>([])
const tasks = ref<ManagerAssignment[]>([])

const hintText = computed(() => {
  if (!hintKey.value) return ''
  return (t.value as Record<string, string>)[hintKey.value] || ''
})

const sectionTitle = computed(() =>
  activeTab.value === 'all' ? t.value.mgrAllTitle : t.value.mgrTitle,
)

const overviewSplit = computed(
  () => `${t.value.filterTodo} ${overviewTodo.value} / ${t.value.filterDoing} ${overviewDoing.value} / ${t.value.filterDone} ${overviewDone.value}`,
)

const progressText = computed(() =>
  t.value.mgrProgressText
    .replace('{done}', String(progressDone.value))
    .replace('{total}', String(progressTotal.value))
    .replace('{pct}', String(progressPct.value)),
)

const filteredTasks = computed(() => {
  const rows = tasks.value.slice()
  if (progressFilter.value === 'all') return rows
  return rows.filter((row) => normalizeStatus(row.status) === progressFilter.value)
})

const filteredReports = computed(() => {
  const rows = reports.value.slice()
  if (progressFilter.value === 'all') return rows
  return rows.filter((row) => normalizeStatus(row.status || '') === progressFilter.value)
})

function normalizeStatus(status: string): string {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'done' || value === 'doing' || value === 'todo') return value
  return 'todo'
}

function managerStatusLabel(status: string): string {
  if (status === 'done') return t.value.tcStatusDone
  if (status === 'doing') return t.value.tcStatusDoing
  return t.value.tcStatusTodo
}

function applyData(data: ManagerDashboard) {
  month.value = data.month || month.value
  overviewTotal.value = data.overview?.total ?? 0
  overviewTodo.value = data.overview?.todo ?? 0
  overviewDoing.value = data.overview?.doing ?? 0
  overviewDone.value = data.overview?.done ?? 0
  monthlyTotal.value = data.monthlyServiceTotal ?? 0
  const d = data.progress?.done ?? 0
  const dg = data.progress?.doing ?? 0
  const total = data.progress?.total ?? 0
  const pct = data.progress?.percentage ?? 0
  progressDone.value = d
  progressDoing.value = dg
  progressTotal.value = total
  progressPct.value = pct
  vehicles.value = data.vehiclesNeedService || []
  reports.value = data.reports || []
  const taskRows = Array.isArray(data.tasks) && data.tasks.length
    ? data.tasks
    : (data.assignments || [])
  tasks.value = taskRows.slice().sort((a, b) => {
    const ta = String(a.updatedAt || a.createdAt || a.deadline || '')
    const tb = String(b.updatedAt || b.createdAt || b.deadline || '')
    return tb.localeCompare(ta)
  })
}

async function load(m?: string) {
  try {
    const data = await fetchManagerDashboard(m || month.value, activeTab.value)
    applyData(data)
    hintKey.value = ''
    hintErr.value = false
  } catch (e: unknown) {
    const err = e as { status?: number }
    if (err.status === 404) {
      hintKey.value = 'mgrHintApiMissing'
      hintErr.value = true
    } else if (err.status === 403) {
      hintKey.value = 'mgrHintForbidden'
      hintErr.value = true
    } else {
      hintKey.value = 'mgrHintLoadFail'
      hintErr.value = true
    }
  }
}

async function onMonthChange() {
  hintKey.value = 'mgrHintRefreshing'
  hintErr.value = false
  progressFilter.value = 'all'
  await load()
}

function setTab(tab: DashTab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  progressFilter.value = 'all'
}

function setProgressFilter(next: ProgressFilter) {
  if (activeTab.value !== 'all') return
  progressFilter.value = progressFilter.value === next && next !== 'all' ? 'all' : next
}

function openReport(r: ManagerReport) {
  if (r.reportUrl) {
    window.open(r.reportUrl, '_blank', 'noopener,noreferrer')
    return
  }
  window.alert(t.value.mgrReportNotReady)
}

function taskLine(row: Pick<ManagerAssignment, 'vehicleNo' | 'maint' | 'assignedTo' | 'deadline'>): string {
  const vehicle = String(row.vehicleNo || '-').trim() || '-'
  const maint = formatMaintLabel(row.maint)
  const owner = row.assignedTo?.name || row.assignedTo?.employeeId || '-'
  const due = row.deadline || '-'
  return `${vehicle} · ${maint} · ${t.value.mgrOwner} ${owner} · ${t.value.mgrDue} ${due}`
}

function openTask(row: {
  id?: string
  title?: string
  vehicleNo?: string
  maint?: string
  deadline?: string
}) {
  const taskId = String(row.id || '').trim()
  if (!taskId) {
    window.alert(t.value.mgrHintLoadFail)
    return
  }
  const maint = String(row.maint || '').trim().toLowerCase() || 'c4'
  const title = String(row.title || row.vehicleNo || taskId).trim()
  const deadline = String(row.deadline || '').trim()
  void router
    .push({
      path: '/task-list',
      query: {
        maint,
        title,
        deadline,
        taskId,
        k: taskId,
        readonly: '1',
      },
    })
    .catch((err) => {
      console.error('[ManagerDashboard] openTask navigation failed', err)
    })
}

watch(activeTab, () => {
  void load()
})

onMounted(() => load())
</script>

<template>
  <section class="manager-board manager-board--ios-home" :aria-label="sectionTitle">
    <div class="manager-board__tabs" role="tablist" :aria-label="t.mgrTabsLabel">
      <button
        type="button"
        role="tab"
        class="manager-board__tab"
        :class="{ 'is-active': activeTab === 'mine' }"
        :aria-selected="activeTab === 'mine'"
        @click="setTab('mine')"
      >
        {{ t.mgrTitle }}
      </button>
      <button
        type="button"
        role="tab"
        class="manager-board__tab"
        :class="{ 'is-active': activeTab === 'all' }"
        :aria-selected="activeTab === 'all'"
        @click="setTab('all')"
      >
        {{ t.mgrAllTitle }}
      </button>
    </div>

    <div class="manager-board__head">
      <div class="manager-board__title-wrap">
        <h2 class="manager-board__title">{{ sectionTitle }}</h2>
        <p class="manager-board__subtitle">{{ t.mgrSubtitle }}</p>
      </div>
      <label class="manager-board__month-picker">
        <span>{{ t.mgrMonth }}</span>
        <MonthPicker v-model="month" @change="onMonthChange" />
      </label>
    </div>

    <div class="manager-board__cards">
      <article class="manager-kpi">
        <p class="manager-kpi__label">{{ t.mgrTaskOverview }}</p>
        <p class="manager-kpi__value">{{ overviewTotal }}</p>
        <p class="manager-kpi__meta">{{ overviewSplit }}</p>
      </article>
      <article class="manager-kpi">
        <p class="manager-kpi__label">{{ t.mgrMonthlyServiceTotal }}</p>
        <p class="manager-kpi__value">{{ monthlyTotal }}</p>
        <p class="manager-kpi__meta">{{ t.mgrMonthlyServiceDone }}</p>
      </article>
    </div>

    <p v-if="hintText" class="manager-hint" :style="{ color: hintErr ? '#dc2626' : '#0f766e' }">{{ hintText }}</p>

    <div class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrProgressTitle }}</h3>
      <div class="manager-progress">
        <div class="manager-progress__stats">
          <button
            type="button"
            class="manager-progress__stat"
            :class="{ 'is-active': activeTab === 'all' && progressFilter === 'done', 'is-clickable': activeTab === 'all' }"
            :disabled="activeTab !== 'all'"
            @click="setProgressFilter('done')"
          >
            <span class="manager-progress__stat-label">{{ t.mgrDone }}</span>
            <strong>{{ progressDone }}</strong>
          </button>
          <button
            type="button"
            class="manager-progress__stat"
            :class="{ 'is-active': activeTab === 'all' && progressFilter === 'doing', 'is-clickable': activeTab === 'all' }"
            :disabled="activeTab !== 'all'"
            @click="setProgressFilter('doing')"
          >
            <span class="manager-progress__stat-label">{{ t.mgrDoing }}</span>
            <strong>{{ progressDoing }}</strong>
          </button>
          <button
            type="button"
            class="manager-progress__stat"
            :class="{ 'is-active': activeTab === 'all' && progressFilter === 'all', 'is-clickable': activeTab === 'all' }"
            :disabled="activeTab !== 'all'"
            @click="setProgressFilter('all')"
          >
            <span class="manager-progress__stat-label">{{ t.mgrTotal }}</span>
            <strong>{{ progressTotal }}</strong>
          </button>
        </div>
        <div class="manager-progress__bar">
          <div class="manager-progress__fill" :style="{ width: `${Math.max(0, Math.min(100, progressPct))}%` }" />
        </div>
        <p class="manager-progress__text">{{ progressText }}</p>
      </div>
    </div>

    <div v-if="activeTab === 'mine'" class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrVehiclesNeedService }}</h3>
      <ul class="manager-list">
        <li v-if="!vehicles.length" class="manager-list__empty">{{ t.mgrNoVehicles }}</li>
        <li
          v-for="v in vehicles"
          :key="v.id || v.vehicleNo"
          class="manager-list__item manager-list__item--action"
        >
          <button type="button" class="manager-task-btn" @click="openTask(v)">
            <strong>{{ taskLine(v) }}</strong>
            <span>{{ v.id || '-' }} · {{ managerStatusLabel(v.status || '') }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrTaskListTitle }}</h3>
      <ul class="manager-list">
        <li v-if="!filteredTasks.length" class="manager-list__empty">{{ t.mgrNoTasks }}</li>
        <li v-for="row in filteredTasks" :key="row.id" class="manager-list__item manager-list__item--action">
          <button type="button" class="manager-task-btn" @click="openTask(row)">
            <strong>{{ taskLine(row) }}</strong>
            <span>{{ row.id }} · {{ managerStatusLabel(row.status) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrReportsTitle }}</h3>
      <ul class="manager-list">
        <li v-if="!(activeTab === 'all' ? filteredReports : reports).length" class="manager-list__empty">{{ t.mgrNoReports }}</li>
        <li
          v-for="r in (activeTab === 'all' ? filteredReports : reports)"
          :key="r.id"
          class="manager-list__item"
        >
          <button type="button" class="manager-report-btn" @click="openReport(r)">
            <strong>{{ r.title }}</strong>
            <span>{{ r.vehicleNo || '-' }} · {{ managerStatusLabel(r.status || '') }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
