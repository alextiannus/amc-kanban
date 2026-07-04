import type { PlatformType } from '../types.ts'
import type { PlatformCopywriter, PlatformCopywriterProfile } from './base.ts'
import { FacebookCopywriter } from './facebook.ts'
import { GoogleBusinessCopywriter } from './googleBusiness.ts'
import { InstagramCopywriter } from './instagram.ts'
import { TikTokCopywriter } from './tiktok.ts'
import { XiaohongshuCopywriter } from './xiaohongshu.ts'

export const platformCopywriters: Record<PlatformType, PlatformCopywriter> = {
  instagram: new InstagramCopywriter(),
  google_business: new GoogleBusinessCopywriter(),
  xiaohongshu: new XiaohongshuCopywriter(),
  facebook: new FacebookCopywriter(),
  tiktok: new TikTokCopywriter(),
}

export function getPlatformCopywriter(platform: PlatformType): PlatformCopywriter {
  return platformCopywriters[platform]
}

export function listPlatformCopywriters(): PlatformCopywriterProfile[] {
  return Object.values(platformCopywriters).map((copywriter) => copywriter.profile)
}
