import { apiGet, apiPost } from './client'
import type { ManagerAssignment, ManagerDashboard } from '@/types/manager'
import { cachedRequest, clearRequestCache } from './requestCache'

export function fetchManagerDashboard(month?: string): Promise<ManagerDashboard> {
  const params: Record<string, string> = {}
  if (month) params.month = month
  const cacheKey = `manager-dashboard:${month || 'current'}`
  return cachedRequest(cacheKey, () => apiGet<ManagerDashboard>('/api/manager/dashboard', params), 60_000)
}

export interface CreateAssignmentPayload {
  assignedToEmployeeId: string
  maint: string
  vehicleNo: string
  depot: string
  plannedStart: string
  deadline: string
  requiresSpecialWorkCertificate?: boolean
  requiredCertificateName?: string
  createdBy: { employeeId: string; name: string }
}

export function postAssignment(payload: CreateAssignmentPayload) {
  return apiPost<{ ok: boolean; assignment?: ManagerAssignment }>('/api/manager/assignments', payload).then((data) => {
    // 与工程师 createTaskCentreTask 一致：写成功后清缓存，列表/看板立刻能拉到新数据
    clearRequestCache('manager-dashboard:')
    const assigneeId = String(payload.assignedToEmployeeId || '').trim()
    if (assigneeId) {
      clearRequestCache(`home-config:${assigneeId}`)
      clearRequestCache(`task-centre:${assigneeId}`)
      clearRequestCache(`task-status:${assigneeId}`)
    }
    return data
  })
}
