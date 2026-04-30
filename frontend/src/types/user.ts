export const ROLE_FSE = 'fse' as const
export const ROLE_RS_MANAGER = 'rsmanager' as const
export const ROLE_FS_MANAGER = 'fieldservicemanager' as const
export const ROLE_FS_DIRECTOR = 'fieldservicedirector' as const
export const ROLE_EXTERNAL_CONTRACTOR = 'externalcontractor' as const

export type UserRole =
  | typeof ROLE_FSE
  | typeof ROLE_RS_MANAGER
  | typeof ROLE_FS_MANAGER
  | typeof ROLE_FS_DIRECTOR
  | typeof ROLE_EXTERNAL_CONTRACTOR

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
  /** 后端 role_info[0].name（展示用，如 RegionalServiceManager） */
  roleDisplayName?: string
  specialWorkCertificates?: UserCertificate[]
  qualifications?: string[]
  skillLevel?: string
  skillTypes?: string[]
}

export const ROLE_LABELS: Record<'zh' | 'en', Record<UserRole, string>> = {
  zh: {
    [ROLE_FSE]: '现场服务工程师',
    [ROLE_RS_MANAGER]: '大区服务经理',
    [ROLE_FS_MANAGER]: '现场服务经理',
    [ROLE_FS_DIRECTOR]: '现场服务总监',
    [ROLE_EXTERNAL_CONTRACTOR]: '外部承包商',
  },
  en: {
    [ROLE_FSE]: 'FieldServiceEngineer',
    [ROLE_RS_MANAGER]: 'RegionalServiceManager',
    [ROLE_FS_MANAGER]: 'FieldServiceManager',
    [ROLE_FS_DIRECTOR]: 'FieldServiceDirector',
    [ROLE_EXTERNAL_CONTRACTOR]: 'Externalcontractor',
  },
}

export const ALL_ROLES: UserRole[] = [
  ROLE_FSE,
  ROLE_RS_MANAGER,
  ROLE_FS_MANAGER,
  ROLE_FS_DIRECTOR,
  ROLE_EXTERNAL_CONTRACTOR,
]

export function isValidRole(v: string): v is UserRole {
  return ALL_ROLES.includes(v as UserRole)
}
