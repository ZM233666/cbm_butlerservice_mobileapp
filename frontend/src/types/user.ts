export const ROLE_FSE = 'fse' as const
export const ROLE_MANAGER = 'manager' as const
export const ROLE_THIRD_PARTY = 'third_party' as const

export type UserRole = typeof ROLE_FSE | typeof ROLE_MANAGER | typeof ROLE_THIRD_PARTY

export interface User {
  username: string
  employeeId: string
  email: string
  department: string
  role: UserRole
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [ROLE_FSE]: 'FSE',
  [ROLE_MANAGER]: '大区经理',
  [ROLE_THIRD_PARTY]: '第三方',
}

export const ALL_ROLES: UserRole[] = [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY]

export function isValidRole(v: string): v is UserRole {
  return ALL_ROLES.includes(v as UserRole)
}
