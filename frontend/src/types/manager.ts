export interface FseMember {
  employeeId: string
  name: string
  email?: string
}

export interface ManagerOverview {
  total: number
  todo: number
  doing: number
  done: number
}

export interface ManagerVehicle {
  vehicleNo: string
  maint: string
  deadline: string
  assignedTo?: { name?: string; employeeId?: string }
}

export interface ManagerReport {
  id: string
  title: string
  vehicleNo?: string
  status?: string
  reportUrl?: string
}

export interface ManagerAssignment {
  id: string
  vehicleNo: string
  maint: string
  assignedTo?: { name?: string; employeeId?: string }
  status: string
  deadline: string
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
  overview: ManagerOverview
  monthlyServiceTotal: number
  vehiclesNeedService: ManagerVehicle[]
  progress: ManagerProgress
  reports: ManagerReport[]
  fseMembers: FseMember[]
  assignments: ManagerAssignment[]
}
