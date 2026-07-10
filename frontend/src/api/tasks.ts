import { apiGet, apiPost } from './client'
import type { HomeConfig, TaskSummary, TaskStatusStore, TaskDetail, TaskCentreResponse } from '@/types/task'
import { cachedRequest, clearRequestCache } from './requestCache'

export function fetchHomeConfig(employeeId: string): Promise<HomeConfig> {
  const id = String(employeeId || '').trim()
  if (!id) return Promise.reject(new Error('employee_id_required'))
  const cacheKey = `home-config:${id}`
  return cachedRequest(cacheKey, () => apiGet<HomeConfig>('/api/home-config', { employeeId: id }), 30_000)
}

export function fetchTaskSummary(): Promise<TaskSummary> {
  return apiGet<TaskSummary>('/api/task-summary')
}

export function fetchTaskStatus(employeeId: string): Promise<{ ok: boolean; statuses: TaskStatusStore }> {
  const cacheKey = `task-status:${employeeId}`
  return cachedRequest(cacheKey, () => apiGet('/api/task-status', { employeeId }), 15_000)
}

export function fetchTaskDetail(taskId: string): Promise<{ ok: boolean; task: TaskDetail }> {
  return apiGet(`/api/tasks/${encodeURIComponent(taskId)}`)
}

export function fetchTaskCentre(employeeId: string, month?: string): Promise<TaskCentreResponse> {
  const params: Record<string, string> = { employeeId }
  if (month) params.month = month
  const cacheKey = `task-centre:${employeeId}:${month || 'current'}`
  return cachedRequest(cacheKey, () => apiGet<TaskCentreResponse>('/api/task-centre', params), 30_000)
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
  return apiPost<{ ok: boolean; task?: unknown; card?: TaskCentreResponse['tasks'][0] }>('/api/task-centre', payload).then((data) => {
    clearRequestCache(`task-centre:${payload.employeeId}`)
    clearRequestCache(`home-config:${payload.employeeId}`)
    return data
  })
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
  }).then((data) => {
    clearRequestCache(`task-status:${employeeId}`)
    clearRequestCache(`home-config:${employeeId}`)
    return data
  })
}

export function fetchGuidanceTasks() {
  return apiGet<{ rows: import('@/types/task').GuidanceRow[] }>('/data/brake-guidance-tasks.json')
}

export interface TaskSubmitResponse {
  ok?: boolean
  id?: number
  taskId?: string
  report?: {
    ok?: boolean
    status?: string
    error?: string
  }
}

export function postTaskSubmit(body: unknown) {
  return apiPost<TaskSubmitResponse>('/api/task-submit', body).then((data) => {
    const employeeId = String(
      (body as any)?.basicInfo?.employeeId || (body as any)?.employeeId || '',
    ).trim()
    if (employeeId) {
      clearRequestCache(`task-status:${employeeId}`)
      clearRequestCache(`home-config:${employeeId}`)
      clearRequestCache(`task-centre:${employeeId}`)
    }
    return data
  })
}

export function postTaskDraft(body: unknown) {
  return apiPost('/api/task-draft', body).then((data) => {
    const employeeId = String(
      (body as any)?.basicInfo?.employeeId || (body as any)?.employeeId || '',
    ).trim()
    if (employeeId) {
      clearRequestCache(`task-status:${employeeId}`)
      clearRequestCache(`home-config:${employeeId}`)
    }
    return data
  })
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
