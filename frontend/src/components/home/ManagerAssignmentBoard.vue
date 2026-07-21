<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchManagerDashboard, postAssignment } from '@/api/manager'
import type { FseMember, ManagerAssignment, ManagerDashboard } from '@/types/manager'
import { fetchUsers } from '@/api/users'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'

const auth = useAuthStore()
const { t, lang } = useI18n()

const month = ref(new Date().toISOString().slice(0, 7))
const hintKey = ref('')
const hintErr = ref(false)
const assignments = ref<ManagerAssignment[]>([])
const fseMembers = ref<FseMember[]>([])

const requiredCertificateName = ref('')
const assignee = ref('')
const maint = ref('c4c6')
const region = ref('')
const depot = ref('')
const vehicleNo = ref('')
const plannedStart = ref('')
const deadline = ref('')

const hintText = computed(() => {
  if (!hintKey.value) return ''
  return (t.value as Record<string, string>)[hintKey.value] || ''
})

const certificateOptions = computed(() => {
  return fseMembers.value
    .flatMap(member => member.specialWorkCertificates || [])
    .map(cert => String(cert.name || '').trim())
    .filter((name, index, list) => !!name && list.indexOf(name) === index)
})

const filteredFseMembers = computed(() => {
  if (!requiredCertificateName.value) return fseMembers.value
  return fseMembers.value.filter(member =>
    (member.specialWorkCertificates || []).some(cert => String(cert.name || '').trim() === requiredCertificateName.value)
  )
})

const selectedFseName = computed(() => {
  const id = String(assignee.value || '').trim()
  if (!id) return ''
  return filteredFseMembers.value.find(m => String(m.employeeId) === id)?.name || ''
})

const maintDisplay = computed(() => {
  const m = String(maint.value || '').trim().toLowerCase()
  if (m === 'c1c3') return 'C1/C3'
  if (m === 'c4c6') return 'C4/C6'
  return String(m || '').toUpperCase()
})

const dispatchSummary = computed(() => {
  const v = vehicleNo.value.trim() || (lang.value === 'en' ? '—' : '—')
  const m = maintDisplay.value || (lang.value === 'en' ? '—' : '—')
  const who = selectedFseName.value || (lang.value === 'en' ? '—' : '—')
  const s = String(plannedStart.value || '').trim() || (lang.value === 'en' ? '—' : '—')
  const d = String(deadline.value || '').trim() || (lang.value === 'en' ? '—' : '—')
  if (lang.value === 'en') {
    return `You are assigning [${v}] [${m}] to [${who}] planned start [${s}] and deadline [${d}].`
  }
  return `你正将 [${v}] 的 [${m}] 分配给 [${who}]，计划开始 [${s}]，截止日期 [${d}]。`
})

const DRAFT_KEY = 'butler.manager.assignmentDraft'

function saveDraft() {
  try {
    const payload = {
      v: 1,
      savedAt: new Date().toISOString(),
      by: auth.user?.employeeId || '',
      requiredCertificateName: requiredCertificateName.value,
      assignee: assignee.value,
      assigneeName: selectedFseName.value,
      maint: maint.value,
      region: region.value,
      depot: depot.value,
      vehicleNo: vehicleNo.value,
      plannedStart: plannedStart.value,
      deadline: deadline.value,
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
    syncDraftIntoAssignments()
    hintKey.value = 'mgrHintDraftSaved'
    hintErr.value = false
  } catch {
    // ignore draft save failures
  }
}

function readDraft(): Partial<Record<string, unknown>> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data as Partial<Record<string, unknown>>
  } catch {
    return null
  }
}

function buildDraftRow(): ManagerAssignment | null {
  const data = readDraft()
  if (!data) return null
  const vehicleNo = String(data.vehicleNo || '').trim()
  const maint = String(data.maint || '').trim()
  const region = String(data.region || '').trim()
  const depot = String(data.depot || '').trim()
  const depotText = region && depot && region !== depot ? `${region} / ${depot}` : (depot || region)
  const deadline = String(data.deadline || '').trim()
  if (!vehicleNo && !maint && !depotText && !deadline) return null

  const assigneeId = String(data.assignee || '').trim()
  const assigneeNameFromDraft = String(data.assigneeName || '').trim()
  const assigneeNameFromList = assigneeId
    ? fseMembers.value.find(m => String(m.employeeId) === assigneeId)?.name || ''
    : ''
  const assigneeName = assigneeNameFromDraft || assigneeNameFromList || ''

  const savedAt = String(data.savedAt || '').trim()
  const id = savedAt ? `draft:${savedAt}` : 'draft:local'

  return {
    id,
    vehicleNo: vehicleNo || '-',
    maint: maint || 'c4c6',
    depot: depotText,
    assignedTo: assigneeName ? { name: assigneeName, employeeId: assigneeId || undefined } : { employeeId: assigneeId || undefined },
    status: 'draft',
    deadline: deadline || '-',
    requiresSpecialWorkCertificate: !!String(data.requiredCertificateName || '').trim(),
    requiredCertificateName: String(data.requiredCertificateName || '').trim() || undefined,
  }
}

function syncDraftIntoAssignments() {
  const draft = buildDraftRow()
  const rest = assignments.value.filter(a => !String(a.id || '').startsWith('draft:'))
  assignments.value = draft ? [draft, ...rest] : rest
}

function applyDraftFromStorage() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Partial<Record<string, unknown>>
    if (data.requiredCertificateName != null) requiredCertificateName.value = String(data.requiredCertificateName || '')
    if (data.assignee != null) assignee.value = String(data.assignee || '')
    if (data.maint != null) maint.value = String(data.maint || maint.value)
    if (data.region != null || data.depot != null) {
      const r = String(data.region || '').trim()
      const d = String(data.depot || '').trim()
      depot.value = r && d && r !== d ? `${r} / ${d}` : (d || r)
      region.value = r
    }
    if (data.vehicleNo != null) vehicleNo.value = String(data.vehicleNo || '')
    if (data.plannedStart != null) plannedStart.value = String(data.plannedStart || '')
    if (data.deadline != null) deadline.value = String(data.deadline || '')
  } catch {
    // ignore bad draft
  }
}

watch([() => requiredCertificateName.value, () => fseMembers.value], () => {
  if (filteredFseMembers.value.some(member => member.employeeId === assignee.value)) return
  assignee.value = ''
})

function managerStatusLabel(status: string): string {
  if (status === 'done') return t.value.tcStatusDone
  if (status === 'doing') return t.value.tcStatusDoing
  if (status === 'draft') return (t.value as any).tcStatusDraft || 'Draft'
  return t.value.tcStatusTodo
}

function applyData(data: ManagerDashboard) {
  month.value = data.month || month.value
  fseMembers.value = data.fseMembers || []
  assignments.value = data.assignments || []
  syncDraftIntoAssignments()
}

async function load(m?: string) {
  try {
    const [data, usersResp] = await Promise.all([
      fetchManagerDashboard(m || month.value),
      fetchUsers('fse'),
    ])
    applyData(data)
    fseMembers.value = usersResp.users.map(user => ({
      employeeId: user.employeeId,
      name: user.username,
      email: user.email,
      specialWorkCertificates: user.specialWorkCertificates || [],
    }))
    hintKey.value = ''
    hintErr.value = false
  } catch (e: unknown) {
    const err = e as { status?: number }
    if (err.status === 404) {
      hintKey.value = 'mgrHintApiMissing'
      hintErr.value = true
      return
    }
    hintKey.value = 'mgrHintLoadFail'
    hintErr.value = true
  }
}

async function onMonthChange() {
  hintKey.value = 'mgrHintRefreshing'
  hintErr.value = false
  await load()
}

async function onAssign() {
  if (
    !assignee.value ||
    !maint.value ||
    !depot.value.trim() ||
    !vehicleNo.value.trim() ||
    !plannedStart.value ||
    !deadline.value
  ) {
    hintKey.value = 'mgrHintFillAll'
    hintErr.value = true
    return
  }

  try {
    const depotText = depot.value.trim()
    await postAssignment({
      assignedToEmployeeId: assignee.value,
      maint: maint.value,
      depot: depotText,
      vehicleNo: vehicleNo.value.trim(),
      plannedStart: plannedStart.value,
      deadline: deadline.value,
      requiresSpecialWorkCertificate: !!requiredCertificateName.value,
      requiredCertificateName: requiredCertificateName.value,
      createdBy: {
        employeeId: auth.user?.employeeId || '',
        name: auth.user?.username || '',
      },
    })
    hintKey.value = 'mgrHintAssignOk'
    hintErr.value = false
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    requiredCertificateName.value = ''
    region.value = ''
    depot.value = ''
    vehicleNo.value = ''
    plannedStart.value = ''
    await load()
  } catch {
    hintKey.value = 'mgrHintAssignFail'
    hintErr.value = true
  }
}

onMounted(async () => {
  await load()
  applyDraftFromStorage()
})
</script>

<template>
  <section class="manager-board manager-board--ios-home" :aria-label="t.mgrAssignPageTitle">
    <div class="manager-board__head">
      <div class="manager-board__title-wrap">
        <h1 class="manager-board__title">{{ t.mgrAssignPageTitle }}</h1>
        <p class="manager-board__subtitle">{{ t.mgrAssignPageSubtitle }}</p>
      </div>
      <label class="manager-board__month-picker">
        <span>{{ t.mgrMonth }}</span>
        <MonthPicker v-model="month" @change="onMonthChange" />
      </label>
    </div>

    <div class="manager-board__panel">
      <h2 class="manager-board__panel-title">{{ t.mgrAssignTitle }}</h2>
      <form class="manager-assign-form manager-assign-form--steps" @submit.prevent="onAssign">
        <section class="mgr-step" aria-label="Step 1">
          <header class="mgr-step__head">
            <span class="mgr-step__no" aria-hidden="true">1</span>
            <div class="mgr-step__copy">
              <p class="mgr-step__title">{{ lang === 'zh' ? '任务人员' : 'Task Personnel' }}</p>
              <p class="mgr-step__sub">{{ lang === 'zh' ? '选择工程师并填写车辆与地点' : 'Pick an engineer and fill vehicle/location' }}</p>
            </div>
          </header>
          <div class="mgr-step__fields">
            <label class="manager-field">
              <span>{{ t.mgrCertificateType }}</span>
              <select v-model="requiredCertificateName">
                <option value="">{{ t.mgrCertificateNone }}</option>
                <option v-for="certificateName in certificateOptions" :key="certificateName" :value="certificateName">
                  {{ certificateName }}
                </option>
              </select>
            </label>
            <label class="manager-field">
              <span>{{ t.mgrFse }}</span>
              <select v-model="assignee" required>
                <option value="">{{ t.mgrSelectFse }}</option>
                <option v-for="member in filteredFseMembers" :key="member.employeeId" :value="member.employeeId">
                  {{ member.name }} ({{ member.employeeId }}){{ member.email ? ` · ${member.email}` : '' }}
                </option>
              </select>
            </label>
            <label class="manager-field">
              <span>{{ lang === 'zh' ? '服务地点/机务段' : 'Service Location / Depot' }}</span>
              <input
                v-model="depot"
                type="text"
                :placeholder="lang === 'zh' ? '服务地点/机务段' : 'Service Location / Depot'"
                required
              />
            </label>
            <label class="manager-field">
              <span>{{ t.mgrVehicleNo }}</span>
              <input v-model="vehicleNo" type="text" :placeholder="t.mgrVehiclePlaceholder" required />
            </label>
          </div>
        </section>

        <section class="mgr-step" aria-label="Step 2">
          <header class="mgr-step__head">
            <span class="mgr-step__no" aria-hidden="true">2</span>
            <div class="mgr-step__copy">
              <p class="mgr-step__title">{{ lang === 'zh' ? '内容与标准' : 'What & How' }}</p>
              <p class="mgr-step__sub">{{ lang === 'zh' ? '选择保养大类' : 'Pick a maintenance category' }}</p>
            </div>
          </header>
          <div class="mgr-step__fields">
            <label class="manager-field manager-field--full">
              <span>{{ t.mgrMaint }}</span>
              <select v-model="maint" required>
                <option value="c4c6">C4/C6</option>
                <option value="c1c3">C1/C3</option>
              </select>
            </label>
          </div>
        </section>

        <section class="mgr-step" aria-label="Step 3">
          <header class="mgr-step__head">
            <span class="mgr-step__no" aria-hidden="true">3</span>
            <div class="mgr-step__copy">
              <p class="mgr-step__title">{{ lang === 'zh' ? '任务周期并派发' : 'Schedule & Dispatch' }}</p>
              <p class="mgr-step__sub">{{ lang === 'zh' ? '确认摘要后下发任务' : 'Review summary then dispatch' }}</p>
            </div>
          </header>
          <div class="mgr-step__fields">
            <label class="manager-field manager-field--full">
              <span>{{ (t as any).mgrPlannedStart }}</span>
              <input v-model="plannedStart" type="date" required />
            </label>
            <label class="manager-field manager-field--full">
              <span>{{ t.mgrDeadline }}</span>
              <input v-model="deadline" type="date" required />
            </label>
            <div class="mgr-summary manager-field--full" role="note" aria-label="Dispatch summary">
              <p class="mgr-summary__text">{{ dispatchSummary }}</p>
            </div>
          </div>
          <div class="manager-actions">
            <button type="button" class="manager-submit manager-submit--ghost" @click="saveDraft">
              {{ (t as any).mgrSaveDraft }}
            </button>
            <button type="submit" class="manager-submit">{{ t.mgrAssignBtn }}</button>
          </div>
          <p class="manager-hint" :style="{ color: hintErr ? '#dc2626' : '#0f766e' }">{{ hintText }}</p>
        </section>
      </form>
    </div>

    <div class="manager-board__panel">
      <h2 class="manager-board__panel-title">{{ t.mgrRecentAssignments }}</h2>
      <div class="manager-table-wrap">
        <table class="manager-table">
          <thead>
            <tr>
              <th>{{ t.mgrTaskId }}</th>
              <th>{{ t.mgrVehicle }}</th>
              <th>{{ t.mgrMaint }}</th>
              <th>{{ t.mgrDepot }}</th>
              <th>{{ t.mgrFse }}</th>
              <th>{{ t.mgrStatus }}</th>
              <th>{{ t.mgrDeadline }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!assignments.length">
              <td colspan="7" class="manager-table__empty">{{ t.mgrNoAssignments }}</td>
            </tr>
            <tr v-for="assignment in assignments" :key="assignment.id">
              <td>{{ assignment.id }}</td>
              <td>{{ assignment.vehicleNo || '-' }}</td>
              <td>{{ assignment.maint.toUpperCase() }}</td>
              <td>{{ assignment.depot || '-' }}</td>
              <td>{{ assignment.assignedTo?.name || assignment.assignedTo?.employeeId || '-' }}</td>
              <td>{{ managerStatusLabel(assignment.status) }}</td>
              <td>{{ assignment.deadline || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
