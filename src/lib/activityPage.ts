export const activityTextDefaults = {
  brandName: { zh: '', en: '' },
  greeting: { zh: '嗨，很高兴遇见你！', en: 'Hi, lovely to see you!' },
  greetingNote: { zh: '谢谢你的到来，让我们把这份缘分留久一点。', en: 'Thanks for stopping by. Let’s make this the start of something lovely.' },
  eyebrow: { zh: '从这一面，到下一次见', en: 'A little hello. A reason to stay in touch.' },
  followTitle: { zh: '成为我们的朋友吧！', en: 'Let’s stay in touch!' },
  followNote: { zh: '店里的新鲜事、特别时刻，还有下一次见面的理由，都想分享给你。', en: 'Good things, fresh stories, and little moments we’d love to share with you.' },
  reward: { zh: '关注账号，可获赠饮品一份', en: 'Follow us and enjoy a complimentary drink.' },
  shareTitle: { zh: '分享本店给朋友', en: 'Share this place with friends' },
  shareNote: { zh: '把喜欢的小店，分享给你在意的人。', en: 'Send a little discovery to someone you care about.' },
  rewardTitle: { zh: '送给关注我们的你', en: 'A little thank-you for following' },
  tapHint: { zh: '轻点图标，就能找到我们', en: 'Tap an icon to find us' },
  reviewTitle: { zh: '今天的体验，想听你说', en: 'How was your visit?' },
  reviewNote: { zh: '在 Google 留下你的真实评价', en: 'Share your honest experience on Google' },
} as const
export type ActivityTextKey = keyof typeof activityTextDefaults
export type ActivityPage = { manualAccounts?: { platformId: 'xiaohongshu'; handle: string; profileUrl: string }[]; text: Partial<Record<'zh' | 'en', Partial<Record<ActivityTextKey, string>>>>; links: Record<string, string>; drawEnabled?: boolean; translations?: Partial<Record<'zh' | 'en', Partial<Record<ActivityTextKey, { source: string; value: string }>>>> }
export function activityLinkKey(platform: string, handle: string) { return `${platform.toLowerCase()}:${encodeURIComponent(handle)}` }
export function activitySourceText(page: ActivityPage | null | undefined, key: ActivityTextKey, locale: 'zh' | 'en', reward?: string | null) {
  const direct = page?.text?.[locale]?.[key]
  if (direct !== undefined) return direct
  if (key !== 'reward' || reward == null) return undefined
  if (reward === activityTextDefaults.reward.zh || reward === activityTextDefaults.reward.en) {
    const other = page?.text?.[locale === 'zh' ? 'en' : 'zh']?.reward
    return other !== undefined && other !== activityTextDefaults.reward.zh && other !== activityTextDefaults.reward.en ? undefined : activityTextDefaults.reward[locale]
  }
  if (!reward.trim()) return ''
  return (/[\u3400-\u9fff]/u.test(reward) ? 'zh' : 'en') === locale ? reward : undefined
}
export function activityText(page: ActivityPage | null | undefined, key: ActivityTextKey, locale: 'zh' | 'en', reward?: string | null) {
  const direct = activitySourceText(page, key, locale, reward)
  if (direct !== undefined) return direct
  const source = activitySourceText(page, key, locale === 'zh' ? 'en' : 'zh', reward)
  const translated = page?.translations?.[locale]?.[key]
  if (source !== undefined && translated?.source === source) return translated.value
  return source ?? activityTextDefaults[key][locale]
}
export function activityPageDraftSnapshot(page: ActivityPage, reward: string) {
  const { translations: _translations, ...editable } = page
  void _translations
  return JSON.stringify([editable, reward])
}
export function activityTranslationTasks(page: ActivityPage, reward?: string | null) {
  const tasks: { key: ActivityTextKey; locale: 'zh' | 'en'; source: string }[] = []
  for (const key of Object.keys(activityTextDefaults) as ActivityTextKey[]) {
    if (['brandName', 'reviewTitle', 'reviewNote'].includes(key)) continue
    for (const locale of ['zh', 'en'] as const) {
      if (activitySourceText(page, key, locale, reward) !== undefined) continue
      const source = activitySourceText(page, key, locale === 'zh' ? 'en' : 'zh', reward)
      if (!source?.trim() || page.translations?.[locale]?.[key]?.source === source) continue
      tasks.push({ key, locale, source })
    }
  }
  return tasks
}
// Existing synchronized destinations may use HTTP; new overrides still require HTTPS.
export function isActivitySourceLink(key: string, value: string): boolean {
  if (!/^[a-z_]+:[^\s]{0,150}$/i.test(key) || value.length > 2048) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}
export function normalizeActivityPage(input: unknown): ActivityPage {
  const out: ActivityPage = { text: {}, links: {} }
  if (input == null) return out
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid activity page')
  const source = input as Record<string, unknown>
  if (source.manualAccounts !== undefined) {
    if (!Array.isArray(source.manualAccounts) || source.manualAccounts.length > 10) throw new Error('Maximum 10 manual accounts')
    out.manualAccounts = source.manualAccounts.map(account => {
      if (!account || account.platformId !== 'xiaohongshu' || typeof account.handle !== 'string' || !account.handle.trim() || account.handle.length > 80 || typeof account.profileUrl !== 'string' || account.profileUrl.length > 2048) throw new Error('Enter an account name and Xiaohongshu profile link')
      const url = new URL(account.profileUrl.trim())
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !['xiaohongshu.com', 'www.xiaohongshu.com', 'xhslink.com', 'www.xhslink.com'].includes(url.hostname) || url.pathname === '/') throw new Error('Use an official HTTPS Xiaohongshu profile or share link')
      return { platformId: 'xiaohongshu' as const, handle: account.handle.trim(), profileUrl: url.href }
    })
    if (new Set(out.manualAccounts.map(a => a.handle)).size !== out.manualAccounts.length) throw new Error('Account names must be unique')
  }
  if (source.drawEnabled !== undefined) {
    if (typeof source.drawEnabled !== 'boolean') throw new Error('Invalid activity selection')
    out.drawEnabled = source.drawEnabled
  }
  if (source.text !== undefined) {
    if (!source.text || typeof source.text !== 'object' || Array.isArray(source.text)) throw new Error('Invalid page text')
    for (const locale of ['zh', 'en'] as const) {
      const values = (source.text as Record<string, unknown>)[locale]
      if (values === undefined) continue
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid page language')
      const localized: Partial<Record<ActivityTextKey, string>> = {}
      for (const key of Object.keys(activityTextDefaults) as ActivityTextKey[]) {
        const value = (values as Record<string, unknown>)[key]
        if (value === undefined) continue
        if (typeof value !== 'string' || value.length > 500) throw new Error('Page text must be at most 500 characters')
        localized[key] = value
      }
      out.text[locale] = localized
    }
  }
  if (source.translations !== undefined) {
    if (!source.translations || typeof source.translations !== 'object' || Array.isArray(source.translations)) throw new Error('Invalid translations')
    out.translations = {}
    for (const locale of ['zh', 'en'] as const) {
      const values = (source.translations as Record<string, unknown>)[locale]
      if (values === undefined) continue
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid translations')
      const localized: NonNullable<NonNullable<ActivityPage['translations']>['zh']> = {}
      for (const key of Object.keys(activityTextDefaults) as ActivityTextKey[]) {
        const entry = (values as Record<string, unknown>)[key]
        if (entry === undefined) continue
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid translation')
        const { source: original, value } = entry as Record<string, unknown>
        if (typeof original !== 'string' || original.length > 500 || typeof value !== 'string' || value.length > 500) throw new Error('Invalid translation')
        localized[key] = { source: original, value }
      }
      out.translations[locale] = localized
    }
  }
  if (source.links !== undefined) {
    if (!source.links || typeof source.links !== 'object' || Array.isArray(source.links) || Object.keys(source.links).length > 50) throw new Error('Invalid account links')
    for (const [key, value] of Object.entries(source.links).sort(([a], [b]) => a.localeCompare(b))) {
      if (!/^[a-z_]+:[^\s]{0,150}$/i.test(key) || typeof value !== 'string' || value.length > 2048) throw new Error('Invalid account link')
      let url: URL
      try { url = new URL(value) } catch { throw new Error('Use a complete HTTPS account link') }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a complete HTTPS account link')
      out.links[key] = url.href
    }
  }
  return out
}
