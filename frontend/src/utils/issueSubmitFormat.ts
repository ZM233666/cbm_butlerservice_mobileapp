import type { AbnormalSeverity, InspectionRecord, InspectionStatus } from '@/types/task'
import { normalizeAbnormalSeverity } from '@/utils/inspectionSeverity'

const STATUS_LABEL_ZH: Record<InspectionStatus, string> = {
  ok: '检查正常',
  abnormal: '发现异常',
  undetectable: '无法检测',
  no_equipment: '无此设备',
}

const SEVERITY_LABEL_ZH: Record<AbnormalSeverity, string> = {
  severe: '严重',
  moderate: '中等',
  minor: '一般',
}

/** 与 Django `format_issue_result` 中文案保持一致，便于入库 result 字段 */
export function formatIssueResultZh(rec: Pick<InspectionRecord, 'status' | 'text' | 'severity'>) {
  const status = rec.status
  const text = String(rec.text || '').trim()
  let label = STATUS_LABEL_ZH[status] || ''
  const severity = normalizeAbnormalSeverity(rec.severity)
  if (status === 'abnormal' && severity) {
    const sevLabel = SEVERITY_LABEL_ZH[severity]
    if (sevLabel) label = `${label}（${sevLabel}）`
  }
  if (!label) return text
  if (status === 'ok' || status === 'no_equipment') {
    return text && text !== label ? `${label}：${text}` : label
  }
  return text && text !== label ? `${label}：${text}` : label
}

export function buildIssueSubmitEntry(rec: InspectionRecord): InspectionRecord & { result?: string } {
  const severity = rec.status === 'abnormal' ? normalizeAbnormalSeverity(rec.severity) : ''
  const entry: InspectionRecord & { result?: string } = {
    status: rec.status,
    text: String(rec.text || '').trim(),
    updatedAt: rec.updatedAt,
  }
  if (rec.status === 'abnormal' && severity) {
    entry.severity = severity
  }
  const result = formatIssueResultZh({ ...entry, severity: entry.severity })
  if (result) entry.result = result
  return entry
}

export function buildIssuesSubmitMap(
  records: Record<string, InspectionRecord | undefined | null>,
): Record<string, InspectionRecord & { result?: string }> {
  const out: Record<string, InspectionRecord & { result?: string }> = {}
  Object.entries(records || {}).forEach(([rowId, raw]) => {
    if (!raw || typeof raw !== 'object') return
    const status = String(raw.status || '').trim().toLowerCase()
    if (!status) return
    out[rowId] = buildIssueSubmitEntry(raw as InspectionRecord)
  })
  return out
}
