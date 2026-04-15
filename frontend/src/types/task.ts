export interface TaskCard {
  href: string
  maint: string
  title: string
  meta: string
  deadline: string
  taskId?: string
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
}

export interface TaskStatusEntry {
  status: 'todo' | 'doing' | 'done'
  updatedAt?: string
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
