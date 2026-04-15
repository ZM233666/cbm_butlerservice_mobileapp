export function getDaysUntilDeadline(dateStr: string): number | null {
  const m = dateStr.match(/\d{4}-\d{2}-\d{2}/)
  if (!m) return null
  const d = new Date(`${m[0]}T00:00:00`)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const ddl = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor((ddl.getTime() - today.getTime()) / 86400000)
}

export type AlertLevel = 'urgent' | 'expired' | null

export function deadlineAlertLevel(days: number | null, status: string): AlertLevel {
  if (status === 'done' || days == null) return null
  if (days < 0) return 'expired'
  if (days <= 3) return 'urgent'
  return null
}

export function deadlineAlertText(days: number | null, status: string): string {
  if (status === 'done' || days == null) return ''
  if (days < 0) return '已过期'
  if (days <= 3) return `剩${days}天`
  return ''
}
