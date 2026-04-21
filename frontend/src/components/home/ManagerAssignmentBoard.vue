<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchManagerDashboard, postAssignment } from '@/api/manager'
import type { FseMember, ManagerAssignment, ManagerDashboard } from '@/types/manager'
import { useI18n } from '@/composables/useI18n'
import MonthPicker from '@/components/common/MonthPicker.vue'

const auth = useAuthStore()
const { t } = useI18n()

const month = ref(new Date().toISOString().slice(0, 7))
const hintKey = ref('')
const hintErr = ref(false)
const assignments = ref<ManagerAssignment[]>([])
const fseMembers = ref<FseMember[]>([])

const assignee = ref('')
const maint = ref('c4c6')
const vehicleNo = ref('')
const deadline = ref('')

const hintText = computed(() => {
  if (!hintKey.value) return ''
  return (t.value as Record<string, string>)[hintKey.value] || ''
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
    const data = await fetchManagerDashboard(m || month.value)
    applyData(data)
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
  if (!assignee.value || !maint.value || !vehicleNo.value.trim() || !deadline.value) {
    hintKey.value = 'mgrHintFillAll'
    hintErr.value = true
    return
  }

  try {
    await postAssignment({
      assignedToEmployeeId: assignee.value,
      maint: maint.value,
      vehicleNo: vehicleNo.value.trim(),
      deadline: deadline.value,
      createdBy: {
        employeeId: auth.user?.employeeId || '',
        name: auth.user?.username || '',
      },
    })
    hintKey.value = 'mgrHintAssignOk'
    hintErr.value = false
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
      <form class="manager-assign-form" @submit.prevent="onAssign">
        <label class="manager-field">
          <span>{{ t.mgrFse }}</span>
          <select v-model="assignee" required>
            <option value="">{{ t.mgrSelectFse }}</option>
            <option v-for="member in fseMembers" :key="member.employeeId" :value="member.employeeId">
              {{ member.name }} ({{ member.employeeId }}){{ member.email ? ` · ${member.email}` : '' }}
            </option>
          </select>
        </label>
        <label class="manager-field">
          <span>{{ t.mgrMaint }}</span>
          <select v-model="maint" required>
            <option value="c4c6">C4/C6</option>
            <option value="c1c3">C1/C3</option>
          </select>
        </label>
        <label class="manager-field">
          <span>{{ t.mgrVehicleNo }}</span>
          <input v-model="vehicleNo" type="text" :placeholder="t.mgrVehiclePlaceholder" required />
        </label>
        <label class="manager-field">
          <span>{{ t.mgrDeadline }}</span>
          <input v-model="deadline" type="date" required />
        </label>
        <button type="submit" class="manager-submit">{{ t.mgrAssignBtn }}</button>
        <p class="manager-hint" :style="{ color: hintErr ? '#dc2626' : '#0f766e' }">{{ hintText }}</p>
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
              <th>{{ t.mgrFse }}</th>
              <th>{{ t.mgrStatus }}</th>
              <th>{{ t.mgrDeadline }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!assignments.length">
              <td colspan="6" class="manager-table__empty">{{ t.mgrNoAssignments }}</td>
            </tr>
            <tr v-for="assignment in assignments" :key="assignment.id">
              <td>{{ assignment.id }}</td>
              <td>{{ assignment.vehicleNo || '-' }}</td>
              <td>{{ assignment.maint.toUpperCase() }}</td>
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
