import { apiGet, apiPost } from './client'
import type { HomeConfig, TaskSummary, TaskStatusStore } from '@/types/task'

export function fetchHomeConfig(): Promise<HomeConfig> {
  return apiGet<HomeConfig>('/api/home-config')
}

export function fetchTaskSummary(): Promise<TaskSummary> {
  return apiGet<TaskSummary>('/api/task-summary')
}

export function fetchTaskStatus(employeeId: string): Promise<{ ok: boolean; statuses: TaskStatusStore }> {
  return apiGet('/api/task-status', { employeeId })
}

export function postTaskStatus(employeeId: string, maint: string, status: string) {
  return apiPost('/api/task-status', { employeeId, maint, status })
}

export function fetchGuidanceTasks() {
  return apiGet<{ rows: import('@/types/task').GuidanceRow[] }>('/data/brake-guidance-tasks.json')
}

export function postTaskSubmit(body: unknown) {
  return apiPost('/api/task-submit', body)
}
