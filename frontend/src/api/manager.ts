import { apiGet, apiPost } from './client'
import type { ManagerDashboard } from '@/types/manager'
import { cachedRequest } from './requestCache'

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
  return apiPost<{ ok: boolean }>('/api/manager/assignments', payload)
}
