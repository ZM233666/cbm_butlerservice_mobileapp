import { apiGet, apiPost } from './client'

export interface WorkOrder {
  id: string
  maint: string
  vehicleNo: string
  title?: string
  deadline?: string
  depot?: string
  requiresSpecialWorkCertificate?: boolean
  requiredCertificateName?: string
  status: 'todo' | 'doing' | 'done'
  assignedTo?: { employeeId?: string; name?: string; email?: string }
  createdBy?: { employeeId?: string; name?: string }
  createdAt?: string
  updatedAt?: string
}

export interface CreateWorkOrderPayload {
  assignedToEmployeeId: string
  maint: string
  vehicleNo: string
  deadline: string
  title?: string
  depot?: string
  requiresSpecialWorkCertificate?: boolean
  requiredCertificateName?: string
  createdBy?: { employeeId: string; name: string }
}

export function createWorkOrder(payload: CreateWorkOrderPayload) {
  return apiPost<{ ok: boolean; workOrder: WorkOrder }>('/api/work-orders', payload)
}

export function setWorkOrderStatus(id: string, status: 'todo' | 'doing' | 'done') {
  return apiPost<{ ok: boolean; workOrder: WorkOrder }>(`/api/work-orders/${encodeURIComponent(id)}/status`, { status })
}

export function fetchWorkOrders(params?: { assigneeId?: string; status?: string; month?: string; maint?: string }) {
  return apiGet<{ ok: boolean; total: number; rows: WorkOrder[] }>('/api/work-orders', params as any)
}

