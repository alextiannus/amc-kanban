import type { PlatformType } from './types'

export function normalizeContentPlatform(value: string | null | undefined): PlatformType {
  const normalized = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (['instagram', 'ins', 'ig'].includes(normalized)) return 'instagram'
  if (['tiktok', 'tt'].includes(normalized)) return 'tiktok'
  if (['facebook', 'fb'].includes(normalized)) return 'facebook'
  if (['xiaohongshu', 'rednote', 'red', 'redbook', 'xhs'].includes(normalized)) return 'xiaohongshu'
  if (['google', 'google_business', 'google_maps', 'google_map', 'google_business_profile', 'gbp', 'gmb'].includes(normalized)) {
    return 'google_business'
  }
  throw new Error(`Unsupported content platform "${value || ''}"`)
}

