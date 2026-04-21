import { apiGet, apiPost, apiPostForm } from './client'
import type { User } from '@/types/user'
import type { UserCertificate } from '@/types/user'

export interface LoginPayload {
  username: string
  employeeId: string
  email: string
  role: string
  department?: string
}

export function loginUser(payload: LoginPayload): Promise<{ ok: boolean; user: User; token: string; isNewUser: boolean }> {
  return apiPost('/api/users/login', payload)
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
