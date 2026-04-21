export const ROLE_FSE = 'fse' as const
export const ROLE_MANAGER = 'manager' as const
export const ROLE_THIRD_PARTY = 'third_party' as const

export type UserRole = typeof ROLE_FSE | typeof ROLE_MANAGER | typeof ROLE_THIRD_PARTY

export type CertificateStatus = 'valid' | 'expiring' | 'expired'

export interface UserCertificate {
  name: string
  id?: string
  issuer?: string
  validUntil?: string
  status?: CertificateStatus
  photoUrl?: string
}

export interface User {
  username: string
  employeeId: string
  email: string
  department: string
  region: string
  role: UserRole
  specialWorkCertificates?: UserCertificate[]
  qualifications?: string[]
  skillLevel?: string
  skillTypes?: string[]
}

export const ROLE_LABELS: Record<'zh' | 'en', Record<UserRole, string>> = {
  zh: {
    [ROLE_FSE]: 'FSE',
    [ROLE_MANAGER]: '大区经理',
    [ROLE_THIRD_PARTY]: '第三方',
  },
  en: {
    [ROLE_FSE]: 'FSE',
    [ROLE_MANAGER]: 'Regional Manager',
    [ROLE_THIRD_PARTY]: 'Third Party',
  },
}

export const ALL_ROLES: UserRole[] = [
  ROLE_FSE,
  ROLE_MANAGER,
  // NOTE(2026-04): 角色调整，暂时隐藏/禁用第三方角色入口与权限控制。
  // 如需恢复 third_party：取消注释该行，并同步恢复 LoginView 角色选项与 auth.ts 的 PAGE_ACCESS 配置。
  // ROLE_THIRD_PARTY,
]

export function isValidRole(v: string): v is UserRole {
  return ALL_ROLES.includes(v as UserRole)
}
