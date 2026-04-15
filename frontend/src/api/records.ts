import { apiGet } from './client'

export interface RecordRow {
  id: string
  code: string
  taskSeq: string
  trainNo: string
  maintType: string
  date: string
  desc: string
}

export function searchRecords(keyword: string, limit = 100) {
  return apiGet<{ ok: boolean; rows: RecordRow[] }>('/api/records', {
    keyword,
    limit: String(limit),
  })
}
