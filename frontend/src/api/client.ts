import { useToastStore } from '@/stores/toast'

const BASE = ''
const TOKEN_KEY = 'butler.auth.token'
const REFRESH_KEY = 'butler.auth.refresh'
const USER_KEY = 'butler.auth.user'

function getStoredEmployeeId(): string {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return ''
    const user = JSON.parse(raw)
    return String(user?.employeeId || user?.username || '').trim()
  } catch {
    return ''
  }
}

function apiErrorMessage(status: number): string {
  const lang = localStorage.getItem('butler.i18n.lang') === 'en' ? 'en' : 'zh'
  if (status >= 500) return lang === 'zh' ? '服务器繁忙，请稍后重试' : 'Server error. Please try again.'
  if (status === 403) return lang === 'zh' ? '没有权限执行此操作' : 'You do not have permission.'
  if (status === 404) return lang === 'zh' ? '请求的资源不存在' : 'Requested resource was not found.'
  return lang === 'zh' ? `请求失败 (${status})` : `Request failed (${status})`
}

function notifyApiError(status: number) {
  if (status === 401) return
  useToastStore().show(apiErrorMessage(status), 'error')
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function getCookie(name: string): string {
  const raw = typeof document === 'undefined' ? '' : String(document.cookie || '')
  if (!raw) return ''
  const parts = raw.split(';').map((x) => x.trim())
  for (const part of parts) {
    if (!part) continue
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    if (k !== name) continue
    return decodeURIComponent(part.slice(idx + 1))
  }
  return ''
}

function getAuthHeaders(extra?: Record<string, string>, opts?: { skipAuth?: boolean }) {
  const headers: Record<string, string> = { ...(extra || {}) }
  if (opts?.skipAuth) return headers
  const token = String(localStorage.getItem(TOKEN_KEY) || '').trim()
  if (token) headers.Authorization = `JWT ${token}`
  // 开发期 SKIP_REMOTE_AUTH：Django JWT 常无工号字段，额外带本地缓存的 employeeId
  const employeeId = getStoredEmployeeId()
  if (employeeId) headers['X-Employee-Id'] = employeeId
  return headers
}

// 防止并发多次刷新：同一时间只发起一次 refresh 请求
let _refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    const rt = String(localStorage.getItem(REFRESH_KEY) || '').trim()
    if (!rt) throw new ApiError(401, 'no_refresh_token')
    const res = await fetch('/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ refresh: rt }),
    })
    if (!res.ok) {
      // refresh token 也失效，清除登录态，通知 App 跳转登录页
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem('butler.auth.user')
      window.dispatchEvent(new CustomEvent('auth:session-expired'))
      throw new ApiError(401, 'refresh_failed')
    }
    const data = await res.json()
    const newAccess = String(data?.access || data?.data?.access || '').trim()
    if (!newAccess) throw new ApiError(401, 'refresh_no_access')
    localStorage.setItem(TOKEN_KEY, newAccess)
    return newAccess
  })()
  _refreshPromise.finally(() => { _refreshPromise = null })
  return _refreshPromise
}

async function fetchWithAuth(input: RequestInfo, init: RequestInit, retried = false): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && !retried) {
    const rt = String(localStorage.getItem(REFRESH_KEY) || '').trim()
    // 开发期常见：本地/过期会话无 refresh。不要抛未捕获异常，把 401 交回给上层 catch。
    if (!rt) return res
    try {
      const newToken = await refreshAccessToken()
      const newInit: RequestInit = {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> || {}),
          Authorization: `JWT ${newToken}`,
        },
      }
      return fetchWithAuth(input, newInit, true)
    } catch (err) {
      const msg = String((err as Error)?.message || '')
      // refresh 明确失败时才踢回登录；no_refresh_token 已在上方短路
      if (msg === 'refresh_failed' || msg === 'refresh_no_access') {
        throw new ApiError(401, 'session_expired')
      }
      return res
    }
  }
  return res
}

export async function apiGetPublic<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(`${BASE}${url.pathname}${url.search}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    notifyApiError(res.status)
    throw new ApiError(res.status, `GET ${path} failed`)
  }
  return res.json()
}

export async function apiPostPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    notifyApiError(res.status)
    throw new ApiError(res.status, `POST ${path} failed`)
  }
  return res.json()
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetchWithAuth(`${BASE}${url.pathname}${url.search}`, {
    headers: getAuthHeaders({ accept: 'application/json' }),
  })
  if (!res.ok) {
    notifyApiError(res.status)
    throw new ApiError(res.status, `GET ${path} failed`)
  }
  return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const csrf = getCookie('csrftoken')
  const res = await fetchWithAuth(`${BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders({
      accept: 'application/json',
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
    }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    notifyApiError(res.status)
    throw new ApiError(res.status, `POST ${path} failed`)
  }
  return res.json()
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetchWithAuth(`${BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    notifyApiError(res.status)
    throw new ApiError(res.status, `POST ${path} failed`)
  }
  return res.json()
}
