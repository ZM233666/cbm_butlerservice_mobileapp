import { apiGet, apiPost } from './client'
import { clearRequestCache } from './requestCache'
import type { TaskCard } from '@/types/task'

export interface RecommendationRow {
  id: string
  maint: string
  title: string
  depot?: string
  deadline?: string
  priority?: 'low' | 'medium' | 'high'
  taskId?: string
  meta?: string
}

export function fetchRecommendations(employeeId: string) {
  return apiGet<{ ok: boolean; total: number; rows: RecommendationRow[] }>('/api/recommendations', { employeeId })
}

export function acceptRecommendation(recommendationId: string, employeeId: string) {
  const id = String(employeeId || '').trim()
  return apiPost<{ ok: boolean; accepted: boolean; workOrder?: unknown }>(
    `/api/recommendations/${encodeURIComponent(recommendationId)}/accept`,
    { employeeId: id },
  ).then((data) => {
    if (id) {
      clearRequestCache(`home-config:${id}`)
      clearRequestCache(`task-status:${id}`)
      clearRequestCache(`task-centre:${id}`)
    }
    return data
  })
}

export function recoToTaskCard(r: RecommendationRow): TaskCard {
  return {
    id: r.id,
    maint: r.maint,
    title: r.title,
    meta: r.meta || 'CBM AI',
    deadline: r.deadline || '',
    priority: r.priority,
    depot: r.depot,
    taskId: r.taskId,
    href: `/task-list?maint=${encodeURIComponent(String(r.maint || ''))}`,
  }
}
