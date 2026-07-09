<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { createTaskCentreTask, fetchTaskCentre } from '@/api/tasks'
import type { TaskCentreResponse } from '@/types/task'

type TaskTemplate = 'c1c3' | 'c4c6' | 'custom'

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
const toast = useToastStore()
const todayMin = computed(() => todayIso())
const adding = ref(false)
const loading = ref(false)

const form = ref({
  template: 'c1c3' as TaskTemplate,
  customName: '',
  trainModel: '',
  requiredAttachments: 19,
  serviceCity: '',
  endDate: '',
})

const centre = ref<TaskCentreResponse | null>(null)
const checklistCounts = ref({ c1c3: 19, c4c6: 45 })

const monthStatusByMonth = computed(() => centre.value?.monthStatusByMonth || {})
const totalServices = computed(() => centre.value?.stats.all ?? 0)
const todoServices = computed(() => centre.value?.stats.todo ?? 0)
const doingServices = computed(() => centre.value?.stats.doing ?? 0)
const completedServices = computed(() => centre.value?.stats.done ?? 0)
const trainStats = computed(() => centre.value?.stats.byTrainModel ?? [])
const attachmentStats = computed(() => centre.value?.stats.attachment ?? { uploaded: 0, required: 0, percent: 0 })

watch(() => form.value.template, (v) => {
  if (v === 'c1c3') form.value.requiredAttachments = checklistCounts.value.c1c3
  else if (v === 'c4c6') form.value.requiredAttachments = checklistCounts.value.c4c6
  else form.value.requiredAttachments = Math.max(0, form.value.requiredAttachments || 0)
})

watch(() => form.value.endDate, (v) => {
  const text = String(v || '').trim()
  if (!text) return
  if (text < todayMin.value) form.value.endDate = todayMin.value
})

const canAddTask = computed(() => {
  if (adding.value) return false
  const templateOk = !!String(form.value.template || '').trim()
  const trainOk = !!String(form.value.trainModel || '').trim()
  const cityOk = !!String(form.value.serviceCity || '').trim()
  const endOk = !!String(form.value.endDate || '').trim()
  if (!templateOk || !trainOk || !cityOk || !endOk) return false
  if (String(form.value.endDate || '').trim() < todayMin.value) return false
  if (form.value.template === 'custom' && !String(form.value.customName || '').trim()) return false
  return true
})

async function loadCentre() {
  const employeeId = String(auth.user?.employeeId || '').trim()
  if (!employeeId) {
    centre.value = null
    return
  }
  loading.value = true
  try {
    const data = await fetchTaskCentre(employeeId, selectedMonth.value)
    centre.value = data
    if (data?.checklistCounts) {
      checklistCounts.value = data.checklistCounts
      if (form.value.template === 'c1c3') form.value.requiredAttachments = data.checklistCounts.c1c3
      else if (form.value.template === 'c4c6') form.value.requiredAttachments = data.checklistCounts.c4c6
    }
  } catch {
    centre.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadCentre()
})

watch(
  () => auth.user?.employeeId || '',
  () => { loadCentre() },
)

watch(selectedMonth, () => {
  loadCentre()
})

function templateTitle(tp: TaskTemplate) {
  if (tp === 'c1c3') return t.value.tcTemplateC1C3
  if (tp === 'c4c6') return t.value.tcTemplateC4C6
  return t.value.tcTemplateCustom
}

async function addTask() {
  if (adding.value || !canAddTask.value) return
  const employeeId = auth.user?.employeeId || ''
  if (!employeeId) return
  adding.value = true
  const name = form.value.template === 'custom'
    ? form.value.customName.trim()
    : `${templateTitle(form.value.template)} Service`
  if (!name) { adding.value = false; return }
  try {
    const maint = form.value.template === 'c1c3' ? 'c1c3' : 'c4c6'
    await createTaskCentreTask({
      employeeId,
      maint,
      trainNo: form.value.trainModel.trim(),
      depot: form.value.serviceCity.trim(),
      deadline: form.value.endDate,
      title: name,
      status: 'doing',
    })
    const endMonth = String(form.value.endDate || '').slice(0, 7)
    if (endMonth && endMonth !== selectedMonth.value) {
      selectedMonth.value = endMonth
    } else {
      await loadCentre()
    }
    toast.show(t.value.tcAdded, 'success', 1800)
  } catch {
    toast.show(lang.value === 'zh' ? '创建任务失败' : 'Failed to create task', 'error', 2200)
  }
  form.value.customName = ''
  form.value.trainModel = ''
  form.value.serviceCity = ''
  form.value.endDate = ''
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
            <p class="tc-kpi__value">{{ centre?.stats.modelCount ?? 0 }}</p>
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
              <label class="tc-date-field">
                <span>{{ t.tcEndDate }}</span>
                <DatePicker v-model="form.endDate" :min="todayMin" />
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
        </div>
      </section>
    </main>

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

.tc-date-field :deep(.dp) {
  margin-top: 0.18rem;
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
@media (max-width: 420px) {
  .tc-step__fields { grid-template-columns: 1fr; }
  .tc-kpis--summary { grid-template-columns: 1fr; }
}
</style>

