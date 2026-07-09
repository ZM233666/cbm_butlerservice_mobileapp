import { apiGet, apiGetPublic, apiPost, apiPostForm, apiPostPublic } from './client'
import type { User } from '@/types/user'
import type { UserCertificate } from '@/types/user'
import { md5 } from '@/utils/md5'

export interface LoginPayload {
  username: string
  password: string
  captcha?: string
  captchaKey?: string | number
}


export interface BackendOk<T> {
  code: number
  data: T
  msg: string
}

export interface LoginData {
  access: string
  refresh?: string
  username?: string
  [k: string]: unknown
}

export interface UserInfoData {
  username?: string
  name?: string
  email?: string | null
  dept_info?: { dept_id?: number; dept_name?: string }
  role_info?: Array<{ id?: number; name?: string; key?: string }>
  department?: string
  [k: string]: unknown
}

function mapRoleFromUserInfo(info: UserInfoData): User['role'] | undefined {
  const ri = info?.role_info?.[0]
  const roleKey = String(ri?.key || '').trim().toLowerCase()
  const roleName = String(ri?.name || '').trim().toLowerCase()

  if (roleKey === 'fse' || roleName === 'fieldserviceengineer') return 'fse'

  // Regional Service Manager（admin/superadmin 也归入管理员视图）
  if (
    roleKey === 'rsmanager' ||
    roleKey === 'rsm' ||
    roleKey === 'manager' ||
    roleKey === 'admin' ||
    roleKey === 'superadmin' ||
    roleKey === 'regionalservicemanager' ||
    roleName === 'regionalservicemanager' ||
    roleName === '管理员' ||
    roleName === '超级管理员'
  )
    return 'rsmanager'

  // Field Service Manager
  if (roleKey === 'fieldservicemanager' || roleKey === 'fsm' || roleName === 'fieldservicemanager') return 'fieldservicemanager'

  // Field Service Director
  if (roleKey === 'fieldservicedirector' || roleKey === 'fsd' || roleName === 'fieldservicedirector') return 'fieldservicedirector'

  // External contractor
  if (
    roleKey === 'externalcontractor' ||
    roleName === 'externalcontractor' ||
    roleKey === 'contractor' ||
    roleKey === 'third_party' // 兼容旧后端/旧约定
  )
    return 'externalcontractor'

  return undefined
}


export async function loginUser(payload: LoginPayload): Promise<{ user: Partial<User>; token: string; refreshToken: string }> {
  const resp = await apiPostPublic<BackendOk<LoginData>>('/api/login/', {
    username: payload.username,
    password: md5(payload.password),
    captcha: payload.captcha ?? '',
    captchaKey: payload.captchaKey,
  })

  if (!resp || resp.code !== 2000) {
    throw new Error(String((resp as any)?.msg || 'login_failed'))
  }
  const token = String(resp.data?.access || '').trim()
  if (!token) throw new Error('missing_access_token')
  const refreshToken = String(resp.data?.refresh || '').trim()
  const username = String(resp.data?.username || payload.username).trim() || payload.username
  return { user: { username, employeeId: username }, token, refreshToken }
}

export async function fetchUserInfo(username: string) {
  const u = String(username || '').trim()
  if (!u) throw new Error('username_required')
  const resp = await apiGet<BackendOk<UserInfoData>>('/api/system/user/user_info/', { username: u })
  if (!resp || resp.code !== 2000) throw new Error(String((resp as any)?.msg || 'user_info_failed'))
  const data = resp.data || {}

  // 后端含义：
  // - data.username: 工号
  // - data.name: 姓名
  // - data.email: 邮箱（可为 null）
  // - data.role_info[0]: name=后台角色名称（如 RegionalServiceManager），key=角色 key（如 RSM）
  const employeeId = String(data.username || '').trim() || u
  const displayName = String(data.name || '').trim()
  const email = data.email == null ? '' : String(data.email).trim()
  const deptName = String(data.dept_info?.dept_name || '').trim()
  // is_superuser 时兜底归入 rsmanager 视图
  const role = mapRoleFromUserInfo(data) ?? ((data as any).is_superuser ? 'rsmanager' : undefined)

  const roleDisplayName = String(data.role_info?.[0]?.name || '').trim()

  const mapped: Partial<User> = {
    employeeId,
    username: displayName || employeeId,
    email,
    department: deptName,
    region: deptName,
    ...(role ? { role } : {}),
    ...(roleDisplayName ? { roleDisplayName } : {}),
  }
  return mapped
}

export interface CaptchaData {
  key: number | string
  image_base: string
}

export async function fetchCaptcha(): Promise<CaptchaData | null> {
  const resp = await apiGetPublic<BackendOk<CaptchaData>>('/api/captcha/')
  if (!resp || resp.code !== 2000) {
    throw new Error('captcha_fetch_failed')
  }
  // 后端关闭验证码（base.captcha_state=false）时 data 为空，登录无需验证码
  if (!resp.data?.key) return null
  return resp.data
}

export function fetchLocalUserProfile(employeeId?: string) {
  const id = String(employeeId || '').trim()
  const params = id ? { employeeId: id } : undefined
  return apiGet<{ ok: boolean; user: User }>('/api/users/self', params)
}

export function fetchUsers(role?: string) {
  const params: Record<string, string> = {}
  if (role) params.role = role
  return apiGet<{ ok: boolean; total: number; users: User[] }>('/api/users', params)
}

export function updateMyCertificates(specialWorkCertificates: Array<string | UserCertificate>) {
  return apiPost<{ ok: boolean; user: User }>('/api/users/self-certificates', { specialWorkCertificates })
}

export function uploadMyCertificatePhoto(file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiPostForm<{ ok: boolean; photoUrl: string; filename: string }>('/api/users/self-certificates/upload', form)
}
