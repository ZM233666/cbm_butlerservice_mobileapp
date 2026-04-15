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

export function postTaskStatus(
  employeeId: string,
  maint: string,
  status: string,
  taskKey?: string,
  meta?: { title?: string; deadline?: string; taskId?: string },
) {
  return apiPost('/api/task-status', {
    employeeId,
    maint,
    status,
    taskKey,
    taskId: meta?.taskId,
    title: meta?.title,
    deadline: meta?.deadline,
  })
}

export function fetchGuidanceTasks() {
  return apiGet<{ rows: import('@/types/task').GuidanceRow[] }>('/data/brake-guidance-tasks.json')
}

export function postTaskSubmit(body: unknown) {
  return apiPost('/api/task-submit', body)
}

export interface EditRequestPayload {
  employeeId: string
  maint: string
  reason: string
  taskId?: string
}

export function postTaskEditRequest(payload: EditRequestPayload) {
  return apiPost<{ ok: boolean; requestId: string }>('/api/task-edit-request', payload)
}
