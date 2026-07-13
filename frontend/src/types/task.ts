export interface TaskCard {
  href: string
  maint: string
  title: string
  meta: string
  deadline: string
  taskId?: string
  depot?: string
  trainNo?: string
  uploadProgress?: { uploaded: number; required: number; percent: number }
}

export interface TaskDetail {
  taskId: string
  employeeId: string
  title: string
  maint: string
  depot: string
  trainNo: string
  deadline: string
  status: 'todo' | 'doing' | 'done' | 'rejected'
  meta?: string
}

export interface TaskCentreStats {
  all: number
  todo: number
  doing: number
  done: number
  rejected: number
  modelCount: number
  attachment: { uploaded: number; required: number; percent: number }
  byTrainModel: { model: string; count: number }[]
}

export interface TaskCentreResponse {
  ok: boolean
  month: string
  employeeId: string
  stats: TaskCentreStats
  monthStatusByMonth: Record<string, 'ok' | 'warn'>
  checklistCounts: { c1c3: number; c4c6: number }
  tasks: TaskCard[]
}

export interface TaskSummaryMaint {
  items?: number
  photos?: number
}

export interface TaskSummary {
  ok: boolean
  maint: Record<string, TaskSummaryMaint>
}

export interface HomeConfig {
  ok: boolean
  tasks: TaskCard[]
  recommendations?: TaskCard[]
  upload?: {
    maxBytes?: number
    allowedContentTypePrefixes?: string[]
  }
}

export interface TaskStatusEntry {
  status: 'todo' | 'doing' | 'done' | 'rejected'
  updatedAt?: string
  /** @deprecated 旧数据兼容，请使用 status=rejected */
  rejected?: boolean
}

export type TaskStatusStore = Record<string, TaskStatusEntry>

export interface GuidanceRow {
  id: string
  seq: string
  description: string
  scopeTags: string[]
  uploadHint?: string
  buttons?: { slot: string; label: string }[]
}
