import { apiPostForm } from './client'

export interface UploadResult {
  ok: boolean
  url: string
  uploadedAt: string
  originalname: string
  displayName: string
  capture?: {
    capturedAt?: string
    location?: {
      latitude?: number
      longitude?: number
      accuracy?: number
      address?: string
      province?: string
      city?: string
      district?: string
    }
  }
}

export function uploadImage(
  slotId: string,
  file: File,
  displayName: string,
  clientMeta?: {
    capturedAt: string
    latitude?: number
    longitude?: number
    accuracy?: number
  },
): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('slotId', slotId)
  fd.append('clientDisplayName', displayName)
  if (clientMeta) {
    fd.append('clientCapturedAt', clientMeta.capturedAt)
    if (clientMeta.latitude != null) fd.append('clientLatitude', String(clientMeta.latitude))
    if (clientMeta.longitude != null) fd.append('clientLongitude', String(clientMeta.longitude))
    if (clientMeta.accuracy != null) fd.append('clientLocationAccuracy', String(clientMeta.accuracy))
  }
  return apiPostForm<UploadResult>('/api/upload', fd)
}
