import { apiGet, apiPost } from './client'
import type { HomeConfig, TaskSummary, TaskStatusStore, TaskDetail, TaskCentreResponse } from '@/types/task'

export function fetchHomeConfig(employeeId?: string): Promise<HomeConfig> {
  const params: Record<string, string> = {}
  if (employeeId) params.employeeId = employeeId
  return apiGet<HomeConfig>('/api/home-config', params)
}

export function fetchTaskSummary(): Promise<TaskSummary> {
  return apiGet<TaskSummary>('/api/task-summary')
}

export function fetchTaskStatus(employeeId: string): Promise<{ ok: boolean; statuses: TaskStatusStore }> {
  return apiGet('/api/task-status', { employeeId })
}

export function fetchTaskDetail(taskId: string): Promise<{ ok: boolean; task: TaskDetail }> {
  return apiGet(`/api/tasks/${encodeURIComponent(taskId)}`)
}

export function fetchTaskCentre(employeeId: string, month?: string): Promise<TaskCentreResponse> {
  const params: Record<string, string> = { employeeId }
  if (month) params.month = month
  return apiGet<TaskCentreResponse>('/api/task-centre', params)
}

export interface CreateTaskCentrePayload {
  employeeId: string
  maint: string
  trainNo: string
  depot: string
  deadline: string
  title?: string
  status?: 'todo' | 'doing' | 'done'
}

export function createTaskCentreTask(payload: CreateTaskCentrePayload) {
  return apiPost<{ ok: boolean; task?: unknown; card?: TaskCentreResponse['tasks'][0] }>('/api/task-centre', payload)
}

export function postTaskStatus(
  employeeId: string,
  maint: string,
  status: 'todo' | 'doing' | 'done' | 'rejected',
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

export function postTaskDraft(body: unknown) {
  return apiPost('/api/task-draft', body)
}

export function fetchLatestTaskSubmit(taskId: string) {
  return apiGet<{
    ok: boolean
    found?: boolean
    submittedAt?: string
    uploads?: Record<string, { url: string; capture?: { capturedAt?: string; location?: Record<string, unknown> } }>
    issues?: Record<string, { text: string; updatedAt?: string }>
  }>('/api/task-submit-latest', { taskId })
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
