<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { fetchManagerDashboard } from '@/api/manager'
import type { ManagerDashboard, ManagerVehicle, ManagerReport } from '@/types/manager'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'
import { formatMaintLabel } from '@/utils/maint'

const { t } = useI18n()
const month = ref(new Date().toISOString().slice(0, 7))
const hintKey = ref('')
const hintErr = ref(false)

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

const hintText = computed(() => {
  if (!hintKey.value) return ''
  return (t.value as Record<string, string>)[hintKey.value] || ''
})

const overviewSplit = computed(
  () => `${t.value.filterTodo} ${overviewTodo.value} / ${t.value.filterDoing} ${overviewDoing.value} / ${t.value.filterDone} ${overviewDone.value}`
)

const progressText = computed(() =>
  t.value.mgrProgressText
    .replace('{done}', String(progressDone.value))
    .replace('{total}', String(progressTotal.value))
    .replace('{pct}', String(progressPct.value))
)

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
  const d = data.progress?.done ?? 0, dg = data.progress?.doing ?? 0, total = data.progress?.total ?? 0
  const pct = data.progress?.percentage ?? 0
  progressDone.value = d; progressDoing.value = dg; progressTotal.value = total; progressPct.value = pct
  vehicles.value = data.vehiclesNeedService || []
  reports.value = data.reports || []
}

async function load(m?: string) {
  try {
    const data = await fetchManagerDashboard(m || month.value)
    applyData(data)
    hintKey.value = ''; hintErr.value = false
  } catch (e: unknown) {
    const err = e as { status?: number }
    if (err.status === 404) { hintKey.value = 'mgrHintApiMissing'; hintErr.value = true }
    else if (err.status === 403) { hintKey.value = 'mgrHintForbidden'; hintErr.value = true }
    else { hintKey.value = 'mgrHintLoadFail'; hintErr.value = true }
  }
}

async function onMonthChange() { hintKey.value = 'mgrHintRefreshing'; hintErr.value = false; await load() }

function openReport(r: ManagerReport) {
  if (r.reportUrl) { window.open(r.reportUrl, '_blank', 'noopener,noreferrer'); return }
  window.alert(t.value.mgrReportNotReady)
}

onMounted(() => load())
</script>

<template>
  <section class="manager-board manager-board--ios-home" :aria-label="t.mgrTitle">
    <div class="manager-board__head">
      <div class="manager-board__title-wrap">
        <h2 class="manager-board__title">{{ t.mgrTitle }}</h2>
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
          <div class="manager-progress__stat"><span class="manager-progress__stat-label">{{ t.mgrDone }}</span><strong>{{ progressDone }}</strong></div>
          <div class="manager-progress__stat"><span class="manager-progress__stat-label">{{ t.mgrDoing }}</span><strong>{{ progressDoing }}</strong></div>
          <div class="manager-progress__stat"><span class="manager-progress__stat-label">{{ t.mgrTotal }}</span><strong>{{ progressTotal }}</strong></div>
        </div>
        <div class="manager-progress__bar"><div class="manager-progress__fill" :style="{ width: `${Math.max(0, Math.min(100, progressPct))}%` }"></div></div>
        <p class="manager-progress__text">{{ progressText }}</p>
      </div>
    </div>

    <div class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrVehiclesNeedService }}</h3>
      <ul class="manager-list">
        <li v-if="!vehicles.length" class="manager-list__empty">{{ t.mgrNoVehicles }}</li>
        <li v-for="v in vehicles" :key="v.vehicleNo" class="manager-list__item">
          <strong>{{ v.vehicleNo }}</strong> · {{ formatMaintLabel(v.maint) }} · {{ t.mgrOwner }} {{ v.assignedTo?.name || v.assignedTo?.employeeId || '-' }} · {{ t.mgrDue }} {{ v.deadline || '-' }}
        </li>
      </ul>
    </div>

    <div class="manager-board__panel">
      <h3 class="manager-board__panel-title">{{ t.mgrReportsTitle }}</h3>
      <ul class="manager-list">
        <li v-if="!reports.length" class="manager-list__empty">{{ t.mgrNoReports }}</li>
        <li v-for="r in reports" :key="r.id" class="manager-list__item">
          <button type="button" class="manager-report-btn" @click="openReport(r)">
            <strong>{{ r.title }}</strong>
            <span>{{ r.vehicleNo || '-' }} · {{ managerStatusLabel(r.status || '') }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
