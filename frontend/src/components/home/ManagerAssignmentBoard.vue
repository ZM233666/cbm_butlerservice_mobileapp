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
const depot = ref('')
const vehicleNo = ref('')
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
  if (lang.value === 'en') {
    if (m === 'c1c3') return 'C1 Maintenance'
    if (m === 'c4c6') return 'C4 Maintenance'
    return String(m || '').toUpperCase()
  }
  if (m === 'c1c3') return 'C1级保养'
  if (m === 'c4c6') return 'C4级保养'
  return String(m || '').toUpperCase()
})

const dispatchSummary = computed(() => {
  const v = vehicleNo.value.trim() || (lang.value === 'en' ? '—' : '—')
  const m = maintDisplay.value || (lang.value === 'en' ? '—' : '—')
  const who = selectedFseName.value || (lang.value === 'en' ? '—' : '—')
  const d = String(deadline.value || '').trim() || (lang.value === 'en' ? '—' : '—')
  if (lang.value === 'en') {
    return `You are assigning [${v}] [${m}] to [${who}] with deadline [${d}].`
  }
  return `你正将 [${v}] 的 [${m}] 分配给 [${who}]，截止日期 [${d}]。`
})

watch([() => requiredCertificateName.value, () => fseMembers.value], () => {
  if (filteredFseMembers.value.some(member => member.employeeId === assignee.value)) return
  assignee.value = ''
})

function managerStatusLabel(status: string): string {
  if (status === 'done') return t.value.tcStatusDone
  if (status === 'doing') return t.value.tcStatusDoing
  return t.value.tcStatusTodo
}

function applyData(data: ManagerDashboard) {
  month.value = data.month || month.value
  fseMembers.value = data.fseMembers || []
  assignments.value = data.assignments || []
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
    !deadline.value
  ) {
    hintKey.value = 'mgrHintFillAll'
    hintErr.value = true
    return
  }

  try {
    await postAssignment({
      assignedToEmployeeId: assignee.value,
      maint: maint.value,
      depot: depot.value.trim(),
      vehicleNo: vehicleNo.value.trim(),
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
    requiredCertificateName.value = ''
    depot.value = ''
    vehicleNo.value = ''
    await load()
  } catch {
    hintKey.value = 'mgrHintAssignFail'
    hintErr.value = true
  }
}

onMounted(() => load())
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
              <p class="mgr-step__title">{{ lang === 'zh' ? '对象与人员' : 'Who & Where' }}</p>
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
              <span>{{ t.tcServiceCity }}</span>
              <input v-model="depot" type="text" :placeholder="t.tcServiceCity" required />
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
              <p class="mgr-step__title">{{ lang === 'zh' ? '定时间并确认与下发' : 'Review & Dispatch' }}</p>
              <p class="mgr-step__sub">{{ lang === 'zh' ? '确认摘要后下发任务' : 'Review summary then dispatch' }}</p>
            </div>
          </header>
          <div class="mgr-step__fields">
            <label class="manager-field manager-field--full">
              <span>{{ t.mgrDeadline }}</span>
              <input v-model="deadline" type="date" required />
            </label>
            <div class="mgr-summary manager-field--full" role="note" aria-label="Dispatch summary">
              <p class="mgr-summary__text">{{ dispatchSummary }}</p>
            </div>
          </div>
          <button type="submit" class="manager-submit">{{ t.mgrAssignBtn }}</button>
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
