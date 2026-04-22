import { apiGet, apiPost } from './client'
import type { ManagerDashboard } from '@/types/manager'

export function fetchManagerDashboard(month?: string): Promise<ManagerDashboard> {
  const params: Record<string, string> = {}
  if (month) params.month = month
  return apiGet<ManagerDashboard>('/api/manager/dashboard', params)
}

export interface CreateAssignmentPayload {
  assignedToEmployeeId: string
  maint: string
  vehicleNo: string
  depot: string
  deadline: string
  requiresSpecialWorkCertificate?: boolean
  requiredCertificateName?: string
  createdBy: { employeeId: string; name: string }
}

export function postAssignment(payload: CreateAssignmentPayload) {
  return apiPost<{ ok: boolean }>('/api/manager/assignments', payload)
}
