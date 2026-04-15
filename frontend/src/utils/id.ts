export function createClientId(prefix = 'id'): string {
  const c = globalThis.crypto

  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }

  const timePart = Date.now().toString(36)

  if (c && typeof c.getRandomValues === 'function') {
    try {
      const values = new Uint32Array(2)
      c.getRandomValues(values)
      return `${prefix}-${timePart}-${values[0].toString(36)}${values[1].toString(36)}`
    } catch {
      // Fallback to Math.random below.
    }
  }

  const randomPart = () => Math.random().toString(36).slice(2, 10)
  return `${prefix}-${timePart}-${randomPart()}-${randomPart()}`
}
