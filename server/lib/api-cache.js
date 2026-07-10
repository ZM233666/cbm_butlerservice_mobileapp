/**
 * 短 TTL 响应缓存 + in-flight 去重，减轻 Django 读压力。
 */
function createApiCache(opts = {}) {
  const defaultTtlMs = Number(opts.defaultTtlMs) > 0 ? Number(opts.defaultTtlMs) : 30 * 1000;
  const maxEntries = Number(opts.maxEntries) > 0 ? Number(opts.maxEntries) : 500;
  const entries = new Map();
  const inflight = new Map();

  function prune() {
    if (entries.size <= maxEntries) return;
    const now = Date.now();
    for (const [key, hit] of entries) {
      if (now > hit.expireAt) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const first = entries.keys().next().value;
      if (first == null) break;
      entries.delete(first);
    }
  }

  function get(key) {
    const hit = entries.get(String(key || ""));
    if (!hit) return undefined;
    if (Date.now() > hit.expireAt) {
      entries.delete(String(key || ""));
      return undefined;
    }
    return hit.value;
  }

  function set(key, value, ttlMs = defaultTtlMs) {
    const k = String(key || "");
    entries.set(k, { value, expireAt: Date.now() + ttlMs });
    prune();
  }

  function del(key) {
    entries.delete(String(key || ""));
  }

  function delPrefix(prefix) {
    const p = String(prefix || "");
    for (const key of entries.keys()) {
      if (key.startsWith(p)) entries.delete(key);
    }
  }

  function clear() {
    entries.clear();
    inflight.clear();
  }

  async function getOrLoad(key, loader, ttlMs = defaultTtlMs) {
    const k = String(key || "");
    const cached = get(k);
    if (cached !== undefined) return cached;

    if (inflight.has(k)) return inflight.get(k);

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => {
        set(k, value, ttlMs);
        inflight.delete(k);
        return value;
      })
      .catch((err) => {
        inflight.delete(k);
        throw err;
      });
    inflight.set(k, promise);
    return promise;
  }

  return { get, set, del, delPrefix, clear, getOrLoad, defaultTtlMs };
}

module.exports = { createApiCache };
