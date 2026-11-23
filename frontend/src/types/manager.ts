import type { UserCertificate } from './user'

export interface FseMember {
  employeeId: string
  name: string
  email?: string
  specialWorkCertificates?: UserCertificate[]
}

export interface ManagerOverview {
  total: number
  todo: number
  doing: number
  done: number
}

export interface ManagerVehicle {
  id?: string
  title?: string
  vehicleNo: string
  maint: string
  deadline: string
  status?: string
  assignedTo?: { name?: string; employeeId?: string }
}

export interface ManagerReport {
  id: string
  title: string
  vehicleNo?: string
  status?: string
  reportUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface ManagerAssignment {
  id: string
  vehicleNo: string
  trainModel?: string
  maint: string
  title?: string
  depot?: string
  requiresSpecialWorkCertificate?: boolean
  requiredCertificateName?: string
  assignedTo?: { name?: string; employeeId?: string }
  status: string
  deadline: string
  createdAt?: string
  updatedAt?: string
}

export interface ManagerProgress {
  done: number
  doing: number
  total: number
  percentage: number
}

export interface ManagerDashboard {
  ok: boolean
  month: string
  scope?: 'mine' | 'all' | string
  overview: ManagerOverview
  monthlyServiceTotal: number
  vehiclesNeedService: ManagerVehicle[]
  progress: ManagerProgress
  reports: ManagerReport[]
  tasks?: ManagerAssignment[]
  fseMembers: FseMember[]
  assignments: ManagerAssignment[]
}
