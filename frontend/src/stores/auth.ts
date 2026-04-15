import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, UserRole } from '@/types/user'
import { ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY, ROLE_LABELS, isValidRole } from '@/types/user'

const USER_KEY = 'butler.auth.user'

const PAGE_ACCESS: Record<string, UserRole[]> = {
  '/': [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
  '/task-center': [ROLE_FSE, ROLE_THIRD_PARTY],
  '/records': [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
  '/my': [ROLE_FSE, ROLE_MANAGER, ROLE_THIRD_PARTY],
  '/task-list': [ROLE_FSE, ROLE_THIRD_PARTY],
}

function normalizeUser(input: Partial<User>): User | null {
  const username = String(input.username || '').trim()
  const employeeId = String(input.employeeId || '').trim()
  const email = String(input.email || '').trim()
  const department = String(input.department || '').trim()
  const rawRole = String(input.role || '').trim().toLowerCase()
  const role: UserRole = isValidRole(rawRole) ? rawRole : ROLE_FSE
  if (!username || !employeeId || !email) return null
  return { username, employeeId, email, department, role }
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

  const isLoggedIn = computed(() => user.value !== null)
  const role = computed<UserRole>(() => user.value?.role ?? ROLE_FSE)
  const roleLabel = computed(() => ROLE_LABELS[role.value])
  const isManager = computed(() => role.value === ROLE_MANAGER)
  const isFse = computed(() => role.value === ROLE_FSE)
  const isThirdParty = computed(() => role.value === ROLE_THIRD_PARTY)

  function login(input: Partial<User>) {
    const normalized = normalizeUser(input)
    if (!normalized) throw new Error('invalid_user_data')
    user.value = normalized
    localStorage.setItem(USER_KEY, JSON.stringify(normalized))
  }

  function logout() {
    user.value = null
    localStorage.removeItem(USER_KEY)
  }

  function canAccess(path: string): boolean {
    const allowed = PAGE_ACCESS[path]
    if (!allowed) return true
    return allowed.includes(role.value)
  }

  return { user, isLoggedIn, role, roleLabel, isManager, isFse, isThirdParty, login, logout, canAccess }
})
