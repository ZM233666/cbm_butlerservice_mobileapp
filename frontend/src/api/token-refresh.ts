/** 解析 Django simplejwt / dvadmin 包装的 refresh 响应 */
export function parseTokenRefreshResponse(data: unknown): { access: string; refresh: string } {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const inner =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null

  const access = String(root.access || inner?.access || '').trim()
  const refresh = String(root.refresh || inner?.refresh || '').trim()
  return { access, refresh }
}

/** HTTP 200 但 body 为业务错误（如 refresh 失效） */
export function isTokenRefreshFailure(data: unknown, httpOk: boolean): boolean {
  if (!httpOk) return true
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (!root) return true
  const code = Number(root.code)
  if (Number.isFinite(code) && code !== 2000) {
    const { access } = parseTokenRefreshResponse(root)
    return !access
  }
  const { access } = parseTokenRefreshResponse(root)
  return !access
}
