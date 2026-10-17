export const activityTextDefaults = {
  brandName: { zh: '', en: '' },
  greeting: { zh: '嗨，很高兴遇见你！', en: 'Hi, lovely to see you!' },
  greetingNote: { zh: '谢谢你的到来，让我们把这份缘分留久一点。', en: 'Thanks for stopping by. Let’s make this the start of something lovely.' },
  eyebrow: { zh: '从这一面，到下一次见', en: 'A little hello. A reason to stay in touch.' },
  followTitle: { zh: '成为我们的朋友吧！', en: 'Let’s stay in touch!' },
  followNote: { zh: '店里的新鲜事、特别时刻，还有下一次见面的理由，都想分享给你。', en: 'Good things, fresh stories, and little moments we’d love to share with you.' },
  rewardTitle: { zh: '送给关注我们的你', en: 'A little thank-you for following' },
  tapHint: { zh: '轻点图标，就能找到我们', en: 'Tap an icon to find us' },
  reviewTitle: { zh: '今天的体验，想听你说', en: 'How was your visit?' },
  reviewNote: { zh: '在 Google 留下你的真实评价', en: 'Share your honest experience on Google' },
} as const
export type ActivityTextKey = keyof typeof activityTextDefaults
export type ActivityPage = { text: Partial<Record<'zh' | 'en', Partial<Record<ActivityTextKey, string>>>>; links: Record<string, string>; drawEnabled?: boolean }
export function activityLinkKey(platform: string, handle: string) { return `${platform.toLowerCase()}:${encodeURIComponent(handle)}` }
export function activityText(page: ActivityPage | null | undefined, key: ActivityTextKey, locale: 'zh' | 'en') {
  return page?.text?.[locale]?.[key] ?? activityTextDefaults[key][locale]
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
