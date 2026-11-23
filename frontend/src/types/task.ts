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
  /** 服务地点 */
  depot: string
  /** 车号，如 HXD1-8888 */
  trainNo: string
  /** 车型；缺失时可由车号解析 */
  trainModel?: string
  /** 走行公里数（km） */
  mileageKm?: number
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
  /** 兼容旧字段；新模板请用 guidance v1.0 按车型+修程计算 */
  checklistCounts?: { c1c3: number; c4c6: number } & Record<string, number>
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

/** 顶层三类；历史 undetectable 读入时会归一为 abnormal + severity=undetectable */
export type InspectionStatus = 'ok' | 'abnormal' | 'no_equipment'

export type AbnormalSeverity = 'severe' | 'moderate' | 'minor' | 'undetectable'

export interface InspectionRecord {
  status: InspectionStatus
  text: string
  updatedAt: string
  /** 仅 abnormal：severe=严重, moderate=中等, minor=一般, undetectable=无法检查 */
  severity?: AbnormalSeverity
}

export interface GuidanceRow {
  id: string
  seq: string
  description: string
  /** @deprecated 旧模板字段；v1.0 已按模板拆分 */
  seqByTemplate?: {
    c1c3?: string
    c4c6?: string
  }
  /** @deprecated 旧模板字段；v1.0 已按模板拆分 */
  scopeTags?: string[]
  materialNumberInput?: string
  serialNumberInput?: string
  overhaulOrManufactureDateInput?: string
  defaultInspectionResult?: string
  imageNaming?: string
  applicability?: string
  remarks?: string
  uploadHint?: string
  /** 默认 always；abnormal=仅检查结果为「发现异常」时要求上传 */
  uploadRequiredWhen?: 'always' | 'abnormal'
  buttons?: { slot: string; label: string }[]
}
