import { apiGet, apiPost } from './client'
import type { TaskCard } from '@/types/task'

export interface RecommendationRow {
  id: string
  maint: string
  title: string
  depot?: string
  deadline?: string
  taskId?: string
  meta?: string
}

export function fetchRecommendations(employeeId: string) {
  return apiGet<{ ok: boolean; total: number; rows: RecommendationRow[] }>('/api/recommendations', { employeeId })
}

export function acceptRecommendation(recommendationId: string, employeeId: string) {
  return apiPost<{ ok: boolean; accepted: boolean; workOrder?: unknown }>(
    `/api/recommendations/${encodeURIComponent(recommendationId)}/accept`,
    { employeeId },
  )
}

export function recoToTaskCard(r: RecommendationRow): TaskCard {
  return {
    maint: r.maint,
    title: r.title,
    meta: r.meta || 'CBM AI',
    deadline: r.deadline || '',
    depot: r.depot,
    taskId: r.taskId,
    href: `/task-list?maint=${encodeURIComponent(String(r.maint || ''))}`,
  }
}

