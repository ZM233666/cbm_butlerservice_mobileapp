import { apiGet } from './client'

export interface RecordRow {
  id: string
  code: string
  taskId?: string
  taskSeq: string
  trainNo: string
  maintType: string
  date: string
  desc: string
  images?: string[]
  uploadCount?: number
}

export function searchRecords(keyword: string, employeeId?: string, limit = 100) {
  const params: Record<string, string> = {
    keyword,
    limit: String(limit),
  }
  if (employeeId) params.employeeId = employeeId
  return apiGet<{ ok: boolean; rows: RecordRow[]; total?: number }>('/api/records', params)
}
