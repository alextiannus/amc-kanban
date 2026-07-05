export type CopywriterPlatform = 'instagram' | 'tiktok' | 'facebook' | 'google_business' | 'xiaohongshu'

export type CopywriterPersona = {
  id: string
  platform: CopywriterPlatform
  name: string
  handle: string
  specialty: string
  language: string
}

export const COPYWRITER_ROSTER: CopywriterPersona[] = [
  {
    id: 'copywriter.instagram',
    platform: 'instagram',
    name: 'Ivy',
    handle: 'Instagram Copywriter',
    specialty: 'Visual storytelling, Reels captions, local discovery',
    language: 'English',
  },
  {
    id: 'copywriter.tiktok',
    platform: 'tiktok',
    name: 'Tiko',
    handle: 'TikTok Copywriter',
    specialty: 'Short video hooks, spoken rhythm, fast conversion',
    language: 'English',
  },
  {
    id: 'copywriter.facebook',
    platform: 'facebook',
    name: 'Felix',
    handle: 'Facebook Copywriter',
    specialty: 'Community updates, offers, customer trust',
    language: 'English',
  },
  {
    id: 'copywriter.google_business',
    platform: 'google_business',
    name: 'Gigi',
    handle: 'Google Business Copywriter',
    specialty: 'Local SEO, search intent, business updates',
    language: 'Random',
  },
  {
    id: 'copywriter.xiaohongshu',
    platform: 'xiaohongshu',
    name: '小红',
    handle: '小红书 Copywriter',
    specialty: '种草标题、生活方式表达、中文笔记',
    language: '中文',
  },
]

export function copywritersFromIds(ids: unknown): CopywriterPersona[] {
  if (!Array.isArray(ids)) return []
  const wanted = new Set(ids.filter((id): id is string => typeof id === 'string'))
  return COPYWRITER_ROSTER.filter((copywriter) => wanted.has(copywriter.id))
}

export function platformAliases(platform: string): string[] {
  const normalized = platform.toLowerCase()
  if (normalized === 'xiaohongshu') return ['xiaohongshu', 'rednote', 'xhs', 'red']
  if (normalized === 'google_business') return ['google_business', 'google', 'google_maps', 'google_map']
  return [normalized]
}
