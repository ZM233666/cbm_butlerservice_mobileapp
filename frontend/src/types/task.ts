export interface TaskCard {
  /** CBM 推荐 ID；行动任务可能为空 */
  id?: string
  href: string
  maint: string
  title: string
  meta: string
  deadline: string
  status?: 'todo' | 'doing' | 'done' | 'rejected'
  priority?: 'low' | 'medium' | 'high'
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
  recommendations: TaskCard[]
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

export type InspectionStatus = 'ok' | 'abnormal' | 'undetectable'

export interface InspectionRecord {
  status: InspectionStatus
  text: string
  updatedAt: string
}

export interface GuidanceRow {
  id: string
  seq: string
  seqByTemplate?: {
    c1c3?: string
    c4c6?: string
  }
  description: string
  scopeTags: string[]
  uploadHint?: string
  buttons?: { slot: string; label: string }[]
}
