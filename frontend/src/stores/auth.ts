import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, UserCertificate, UserRole } from '@/types/user'
import {
  ROLE_EXTERNAL_CONTRACTOR,
  ROLE_FSE,
  ROLE_FS_DIRECTOR,
  ROLE_FS_MANAGER,
  ROLE_LABELS,
  ROLE_RS_MANAGER,
  isValidRole,
} from '@/types/user'
import { fetchUserInfo } from '@/api/users'
import { useI18nStore } from './i18n'

const USER_KEY = 'butler.auth.user'
const TOKEN_KEY = 'butler.auth.token'

const PAGE_ACCESS: Record<string, UserRole[]> = {
  '/': [ROLE_FSE, ROLE_RS_MANAGER, ROLE_FS_MANAGER, ROLE_FS_DIRECTOR, ROLE_EXTERNAL_CONTRACTOR],
  '/assignments': [ROLE_RS_MANAGER, ROLE_FS_MANAGER, ROLE_FS_DIRECTOR],
  '/task-center': [ROLE_FSE, ROLE_EXTERNAL_CONTRACTOR],
  '/records': [ROLE_FSE, ROLE_RS_MANAGER, ROLE_FS_MANAGER, ROLE_FS_DIRECTOR, ROLE_EXTERNAL_CONTRACTOR],
  '/my': [ROLE_FSE, ROLE_RS_MANAGER, ROLE_FS_MANAGER, ROLE_FS_DIRECTOR, ROLE_EXTERNAL_CONTRACTOR],
  '/task-list': [ROLE_FSE, ROLE_EXTERNAL_CONTRACTOR],
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeCertificateStatus(input: unknown): UserCertificate['status'] {
  const value = String(input || '').trim().toLowerCase()
  if (value === 'valid' || value === 'expiring' || value === 'expired') return value
  return undefined
}

function normalizeCertificates(input: unknown): UserCertificate[] {
  if (!Array.isArray(input)) return []
  const rows: UserCertificate[] = []
  input.forEach((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) rows.push({ name, status: 'valid' })
      return
    }
    if (!item || typeof item !== 'object') return
    const row = item as Partial<UserCertificate>
    const name = String(row.name || '').trim()
    if (!name) return
    const id = String(row.id || '').trim()
    const issuer = String(row.issuer || '').trim()
    const validUntil = String(row.validUntil || '').trim()
    const photoUrl = String(row.photoUrl || '').trim()
    rows.push({
      name,
      id: id || undefined,
      issuer: issuer || undefined,
      validUntil: validUntil || undefined,
      photoUrl: photoUrl || undefined,
      status: normalizeCertificateStatus(row.status) || 'valid',
    })
  })
  return rows
}

function normalizeUser(input: Partial<User>): User | null {
  const username = String(input.username || '').trim()
  const employeeId = String(input.employeeId || '').trim() || username || 'unknown'
  const email = String(input.email || '').trim()
  const department = String(input.department || '').trim()
  let rawRole = String(input.role || '').trim().toLowerCase()
  // 兼容旧版本本地缓存的角色值
  if (rawRole === 'manager') rawRole = ROLE_RS_MANAGER
  if (rawRole === 'third_party') rawRole = ROLE_EXTERNAL_CONTRACTOR
  const role: UserRole = isValidRole(rawRole) ? rawRole : ROLE_FSE
  const region =
    String(input.region || '').trim() ||
    (role === ROLE_RS_MANAGER || role === ROLE_FS_MANAGER || role === ROLE_FS_DIRECTOR ? 'Suzhou' : 'Shanghai')
  const specialWorkCertificates = normalizeCertificates((input as any).specialWorkCertificates)
  const qualifications = normalizeStringList((input as any).qualifications)
  const skillLevel = String((input as any).skillLevel || '').trim()
  const skillTypes = normalizeStringList((input as any).skillTypes)
  const roleDisplayName = String((input as any).roleDisplayName || '').trim()
  if (!username) return null
  return {
    username,
    employeeId,
    email,
    department,
    region,
    role,
    ...(roleDisplayName ? { roleDisplayName } : {}),
    specialWorkCertificates,
    qualifications,
    skillLevel: skillLevel || undefined,
    skillTypes,
  }
}

function readFromStorage(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return normalizeUser(JSON.parse(raw))
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const i18n = useI18nStore()
  const user = ref<User | null>(readFromStorage())
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')

  const isLoggedIn = computed(() => user.value !== null && !!token.value)
  const role = computed<UserRole>(() => user.value?.role ?? ROLE_FSE)
  const roleLabel = computed(() => {
    const fromApi = String(user.value?.roleDisplayName || '').trim()
    if (fromApi) return fromApi
    return ROLE_LABELS[i18n.lang][role.value]
  })
  const isManager = computed(() => role.value === ROLE_RS_MANAGER || role.value === ROLE_FS_MANAGER || role.value === ROLE_FS_DIRECTOR)
  const isFse = computed(() => role.value === ROLE_FSE)
  const isThirdParty = computed(() => role.value === ROLE_EXTERNAL_CONTRACTOR)

  function login(input: Partial<User>, accessToken?: string) {
    const normalized = normalizeUser(input)
    const t = String(accessToken || '').trim()
    if (!normalized || !t) throw new Error('invalid_user_data')
    user.value = normalized
    token.value = t
    localStorage.setItem(USER_KEY, JSON.stringify(normalized))
    localStorage.setItem(TOKEN_KEY, t)
  }

  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  function canAccess(path: string): boolean {
    const allowed = PAGE_ACCESS[path]
    if (!allowed) return true
    return allowed.includes(role.value)
  }

  async function refreshProfile() {
    const current = user.value
    const currentToken = String(token.value || '').trim()
    if (!current || !currentToken) return false
    try {
      const key = String(current.employeeId || current.username || '').trim()
      if (!key) return false
      const info = await fetchUserInfo(key)
      const rawRole = String((info as any).role || '').trim().toLowerCase()
      const safeRole: UserRole | undefined = rawRole && isValidRole(rawRole) ? (rawRole as UserRole) : undefined
      const { role: _ignoredRole, ...rest } = (info as any) || {}
      const merged: Partial<User> = { ...current, ...rest, ...(safeRole ? { role: safeRole } : {}) }
      login(merged, currentToken)
      return true
    } catch {
      return false
    }
  }

  return { user, token, isLoggedIn, role, roleLabel, isManager, isFse, isThirdParty, login, logout, canAccess, refreshProfile }
})
