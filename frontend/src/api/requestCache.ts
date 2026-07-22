/**
 * 前端 GET 短缓存 + 并发去重，避免首页等同屏多组件重复打后端。
 */
type CacheEntry<T> = { at: number; data: T }

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export function clearRequestCache(prefix?: string) {
  if (!prefix) {
    cache.clear()
    inflight.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
}

export async function cachedRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < ttlMs) return hit.data as T

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { at: Date.now(), data })
      inflight.delete(key)
      return data
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, promise)
  return promise
}
