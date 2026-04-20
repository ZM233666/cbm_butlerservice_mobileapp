import { apiGet, apiPost } from './client'
import type { User } from '@/types/user'

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
