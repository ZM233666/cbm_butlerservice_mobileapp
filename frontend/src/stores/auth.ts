import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, UserRole } from '@/types/user'
import { ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY, ROLE_LABELS, isValidRole } from '@/types/user'

const USER_KEY = 'butler.auth.user'
const TOKEN_KEY = 'butler.auth.token'

const PAGE_ACCESS: Record<string, UserRole[]> = {
  // NOTE(2026-04): 角色调整，暂时隐藏/禁用 third_party 角色。
  // 如需恢复：把 ROLE_THIRD_PARTY 重新加回各路由白名单，并同步恢复 LoginView 角色选项与 types/user.ts 的 ALL_ROLES。
  '/': [ROLE_FSE, ROLE_MANAGER /* , ROLE_THIRD_PARTY */],
  '/task-center': [ROLE_FSE /* , ROLE_THIRD_PARTY */],
  '/records': [ROLE_FSE, ROLE_MANAGER /* , ROLE_THIRD_PARTY */],
  '/my': [ROLE_FSE, ROLE_MANAGER /* , ROLE_THIRD_PARTY */],
  '/task-list': [ROLE_FSE /* , ROLE_THIRD_PARTY */],
}

function normalizeUser(input: Partial<User>): User | null {
  const username = String(input.username || '').trim()
  const employeeId = String(input.employeeId || '').trim()
  const email = String(input.email || '').trim()
  const department = String(input.department || '').trim()
  const rawRole = String(input.role || '').trim().toLowerCase()
  const role: UserRole = isValidRole(rawRole) ? rawRole : ROLE_FSE
  const region = String(input.region || '').trim() || (role === ROLE_MANAGER ? 'Suzhou' : 'Shanghai')
  if (!username || !employeeId || !email) return null
  return { username, employeeId, email, department, region, role }
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
  const user = ref<User | null>(readFromStorage())
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')

  const isLoggedIn = computed(() => user.value !== null && !!token.value)
  const role = computed<UserRole>(() => user.value?.role ?? ROLE_FSE)
  const roleLabel = computed(() => ROLE_LABELS[role.value])
  const isManager = computed(() => role.value === ROLE_MANAGER)
  const isFse = computed(() => role.value === ROLE_FSE)
  const isThirdParty = computed(() => role.value === ROLE_THIRD_PARTY)

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

  return { user, token, isLoggedIn, role, roleLabel, isManager, isFse, isThirdParty, login, logout, canAccess }
})
