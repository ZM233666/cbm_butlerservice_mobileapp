const BASE = ''
const TOKEN_KEY = 'butler.auth.token'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function getAuthHeaders(extra?: Record<string, string>) {
  const token = String(localStorage.getItem(TOKEN_KEY) || '').trim()
  const headers: Record<string, string> = { ...(extra || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(`${BASE}${url.pathname}${url.search}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed`)
  return res.json()
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, `POST ${path} failed`)
  return res.json()
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  })
  if (!res.ok) throw new ApiError(res.status, `POST ${path} failed`)
  return res.json()
}
