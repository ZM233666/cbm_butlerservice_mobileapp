import { apiGetPublic, apiPostPublic } from './client'

export interface CaptchaData {
  key: number | string
  image_base: string
}

export interface CaptchaResponse {
  code: number
  data: CaptchaData
  msg: string
}

export async function fetchCaptcha(): Promise<CaptchaData> {
  const resp = await apiGetPublic<CaptchaResponse>('/api/captcha/')
  if (!resp || !resp.data || !resp.data.image_base) throw new Error('invalid_captcha_response')
  return resp.data
}

