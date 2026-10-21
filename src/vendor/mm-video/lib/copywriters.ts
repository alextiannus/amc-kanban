export type CopywriterPlatform = 'instagram' | 'tiktok' | 'facebook' | 'google_business' | 'xiaohongshu'

export type CopywriterPersona = {
  id: string
  platform: CopywriterPlatform
  name: string
  handle: string
  specialty: string
  language: string
  accentClass: string
}

export const COPYWRITER_ROSTER: CopywriterPersona[] = [
  {
    id: 'copywriter.instagram',
    platform: 'instagram',
    name: 'Ivy',
    handle: 'Instagram Copywriter',
    specialty: '视觉叙事、Reels caption、本地发现',
    language: 'English',
    accentClass: 'from-pink-500 to-orange-400',
  },
  {
    id: 'copywriter.tiktok',
    platform: 'tiktok',
    name: 'Tiko',
    handle: 'TikTok Copywriter',
    specialty: '短视频 hook、口语节奏、快速转化',
    language: 'English',
    accentClass: 'from-slate-900 to-cyan-500',
  },
  {
    id: 'copywriter.facebook',
    platform: 'facebook',
    name: 'Felix',
    handle: 'Facebook Copywriter',
    specialty: '社区沟通、活动说明、客户信任',
    language: 'English',
    accentClass: 'from-blue-600 to-sky-400',
  },
  {
    id: 'copywriter.google_business',
    platform: 'google_business',
    name: 'Gigi',
    handle: 'Google Business Copywriter',
    specialty: '搜索意图、本地 SEO、门店更新',
    language: 'Random',
    accentClass: 'from-emerald-500 to-amber-400',
  },
  {
    id: 'copywriter.xiaohongshu',
    platform: 'xiaohongshu',
    name: '小红',
    handle: '小红书 Copywriter',
    specialty: '种草标题、生活方式表达、中文笔记',
    language: '中文',
    accentClass: 'from-rose-500 to-red-500',
  },
]

export function platformAliases(platform: string): string[] {
  const normalized = platform.toLowerCase()
  if (normalized === 'xiaohongshu') return ['xiaohongshu', 'rednote', 'xhs', 'red']
  if (normalized === 'google_business') return ['google_business', 'google', 'google_maps', 'google_map']
  return [normalized]
}

export function findCopywriterByPlatform(platform: string): CopywriterPersona | undefined {
  const aliases = platformAliases(platform)
  return COPYWRITER_ROSTER.find((copywriter) => aliases.includes(copywriter.platform))
}

export function copywriterDisplayName(platform: string): string {
  const copywriter = findCopywriterByPlatform(platform)
  return copywriter ? `${copywriter.name} · ${copywriter.handle}` : platform
}

export function draftAccountIdForCopywriter(
  copywriter: CopywriterPersona,
  accounts: Array<{ id?: string; platformId?: string | null }>,
): string {
  const aliases = platformAliases(copywriter.platform)
  const account = accounts.find((item) => aliases.includes((item.platformId || '').toLowerCase()))
  return account?.id || `unconfigured_${copywriter.platform}`
}

export function configuredCopywriterIdsForAccounts(
  accounts: Array<{ id?: string | null; platformId?: string | null; handle?: string | null; isConnected?: boolean | null }>,
): string[] {
  return COPYWRITER_ROSTER
    .filter((copywriter) => {
      const aliases = platformAliases(copywriter.platform)
      return accounts.some((account) => {
        if (!account?.id || account.handle === 'unconfigured' || account.isConnected === false) return false
        return aliases.includes((account.platformId || '').toLowerCase())
      })
    })
    .map((copywriter) => copywriter.id)
}

export function defaultSelectedCopywriterIdsForAccounts(
  accounts: Array<{ id?: string | null; platformId?: string | null; handle?: string | null; isConnected?: boolean | null }>,
): string[] {
  const configuredIds = configuredCopywriterIdsForAccounts(accounts)
  const xiaohongshu = COPYWRITER_ROSTER.find((copywriter) => copywriter.platform === 'xiaohongshu')
  return [...new Set([...configuredIds, xiaohongshu?.id].filter((id): id is string => Boolean(id)))]
}
