import { apiGet, apiPost, apiPostForm } from './client'
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
  const roleKey = String(info?.role_info?.[0]?.key || '').trim().toLowerCase()
  if (roleKey === 'fse') return 'fse'
  if (roleKey === 'manager' || roleKey === 'regionalmanager' || roleKey === 'rm') return 'manager'
  return undefined
}

export async function loginUser(payload: LoginPayload): Promise<{ user: Partial<User>; token: string }> {
  const resp = await apiPost<BackendOk<LoginData>>('/api/login/', {
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
  const username = String(resp.data?.username || payload.username).trim() || payload.username
  return { user: { username }, token }
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
  // - data.role_info[0]: 角色信息（name=展示名, key=角色key）
  const employeeId = String(data.username || '').trim() || u
  const displayName = String(data.name || '').trim()
  const email = data.email == null ? '' : String(data.email).trim()
  const deptName = String(data.dept_info?.dept_name || '').trim()
  const role = mapRoleFromUserInfo(data)

  const mapped: Partial<User> & { roleDisplayName?: string } = {
    employeeId,
    username: displayName || employeeId,
    email,
    department: deptName,
    region: deptName,
    ...(role ? { role } : {}),
  }

  const roleDisplayName = String(data.role_info?.[0]?.name || '').trim()
  if (roleDisplayName) (mapped as any).roleDisplayName = roleDisplayName
  return mapped
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
