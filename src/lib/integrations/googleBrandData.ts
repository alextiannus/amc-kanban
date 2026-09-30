import { createHash } from 'node:crypto'

type Obj = Record<string, any>
export const object = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {}
export const text = (v: unknown, max = 2000) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const list = (v: unknown): Obj[] => Array.isArray(v) ? v.map(object) : []
export class GoogleImportError extends Error { constructor(public code: string) { super(code) } }
export function googleId(value: unknown, kind: 'accounts' | 'locations') {
  const raw = text(value, 300)
  const match = raw.match(new RegExp(`^(?:${kind}/)?([a-zA-Z0-9_-]+)$`))
  if (!match) throw new GoogleImportError(`GOOGLE_${kind.toUpperCase()}_REQUIRED`)
  return match[1]
}
export async function googleGet(url: string, accessToken: string, request: typeof fetch = fetch): Promise<Obj> {
  try {
    const r = await request(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' })
    if (!r.ok) throw new GoogleImportError(`GOOGLE_HTTP_${r.status}`)
    return object(await r.json())
  } catch (e) {
    if (e instanceof GoogleImportError) throw e
    throw new GoogleImportError('GOOGLE_CONNECTION_FAILED')
  }
}
export async function listOwnedGoogleLocations(token: string, request: typeof fetch = fetch) {
  const result: Array<{id: string; accountId: string; name: string; address: string}> = []
  let accountPage = ''
  for (let ap = 0; ap < 10; ap++) {
    const accounts = await googleGet(`https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${accountPage ? `&pageToken=${encodeURIComponent(accountPage)}` : ''}`, token, request)
    for (const account of list(accounts.accounts)) {
      const accountId = googleId(account.name, 'accounts')
      let page = ''
      for (let lp = 0; lp < 10; lp++) {
        const locations = await googleGet(`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?readMask=name,title,storefrontAddress&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, token, request)
        for (const l of list(locations.locations)) result.push({ id: googleId(l.name, 'locations'), accountId, name: text(l.title), address: postalAddress(l.storefrontAddress) })
        page = text(locations.nextPageToken)
        if (!page) break
        if (lp === 9) throw new GoogleImportError('GOOGLE_LOCATION_LIST_TOO_LARGE')
      }
    }
    accountPage = text(accounts.nextPageToken)
    if (!accountPage) break
    if (ap === 9) throw new GoogleImportError('GOOGLE_ACCOUNT_LIST_TOO_LARGE')
  }
  return result
}
export function postalAddress(value: unknown) {
  const a = object(value)
  return [ ...(Array.isArray(a.addressLines) ? a.addressLines.map((v: unknown) => text(v)) : []), text(a.locality), text(a.administrativeArea), text(a.postalCode), text(a.regionCode) ].filter(Boolean).join(', ')
}
const label = (value: unknown) => list(value).find(l => /^zh/i.test(text(l.languageCode))) || list(value)[0] || {}
export function normalizeGoogleMenu(value: unknown, locationId: string, observedAt: string) {
  const items = new Map<string, Obj>()
  for (const menu of list(object(value).menus)) for (const section of list(menu.sections)) for (const item of list(section.items)) {
    for (const entry of [item, ...list(item.options)]) {
      const l = label(entry.labels), name = text(l.displayName, 140)
      if (!name) continue
      const identity = name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
      const id = `google-menu-${createHash('sha256').update(`${locationId}:${identity}`).digest('hex').slice(0, 24)}`
      const price = object(object(entry.attributes).price)
      // Do not infer price, stock, health claims or promotional terms.
      items.set(id, { id, name, description: text(l.description, 1000),
        ...(price.currencyCode && /^\d+$/.test(String(price.units ?? '')) ? { price: `${text(price.currencyCode, 3)} ${(Number(price.units) + Number(price.nanos || 0) / 1e9).toFixed(2)}` } : {}),
        source: { provider: 'google_business_profile', kind: 'merchant_menu', locationId, observedAt } })
    }
  }
  return [...items.values()].slice(0, 500)
}
export function summarizeGoogleReviews(value: unknown, products: Obj[]) {
  const v = object(value), reviews = list(v.reviews)
  const ratings: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
  const distribution = [0, 0, 0, 0, 0]
  for (const r of reviews) { const n = ratings[r.starRating]; if (n) distribution[n - 1]++ }
  const themes = [
    ['food', /food|taste|delicious|菜|好吃|味道|口味|食物/i],
    ['service', /service|staff|服务|員工|员工|態度|态度/i],
    ['value', /price|value|expensive|cheap|价格|性价比|贵|便宜/i],
    ['waiting', /wait|queue|等位|排队|等待/i],
    ['environment', /ambience|atmosphere|clean|环境|卫生|乾淨|干净/i],
  ] as const
  const dates = reviews.map(r => text(r.updateTime || r.createTime)).filter(d => Number.isFinite(Date.parse(d))).sort()
  return { kind: 'customer_feedback', method: 'rating_and_keyword_summary', sampleSize: reviews.length,
    totalReviewCount: typeof v.totalReviewCount === 'number' ? v.totalReviewCount : null,
    averageRating: typeof v.averageRating === 'number' ? v.averageRating : null,
    distribution, from: dates[0] || null, to: dates.at(-1) || null,
    truncated: !!v.nextPageToken,
    themes: themes.map(([topic, pattern]) => ({ topic, mentions: reviews.filter(r => pattern.test(text(r.comment))).length })).filter(t => t.mentions),
    productMentions: products.map(p => ({ skuId: p.id, name: p.name, mentions: reviews.filter(r => text(r.comment).toLowerCase().includes(text(p.name).toLowerCase())).length })).filter(p => p.mentions),
    note: '顾客反馈统计，主题提及不代表赞扬；不是商家承诺，也不自动生成 SKU。',
  }
}
export async function readGoogleBrandData(token: string, account: string, location: string, request: typeof fetch = fetch) {
  const accountId = googleId(account, 'accounts'), locationId = googleId(location, 'locations')
  const resource = `accounts/${accountId}/locations/${locationId}`
  const observedAt = new Date().toISOString()
  const profile = await googleGet(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,profile,metadata`, token, request)
  if (googleId(profile.name, 'locations') !== locationId) throw new GoogleImportError('GOOGLE_LOCATION_MISMATCH')
  const missing: string[] = []
  const [legacy, reviewResult] = await Promise.allSettled([
    googleGet(`https://mybusiness.googleapis.com/v4/${resource}?readMask=locationState`, token, request),
    googleGet(`https://mybusiness.googleapis.com/v4/${resource}/reviews?pageSize=50&orderBy=updateTime%20desc`, token, request),
  ])
  let menu: Obj[] = []
  if (legacy.status === 'fulfilled' && object(legacy.value.locationState).canHaveFoodMenu === true) {
    try { menu = normalizeGoogleMenu(await googleGet(`https://mybusiness.googleapis.com/v4/${resource}/foodMenus`, token, request), resource, observedAt) }
    catch { missing.push('MENU_READ_UNAVAILABLE') }
  } else missing.push('MENU_NOT_AVAILABLE_OR_NOT_AUTHORIZED')
  if (!menu.length) missing.push('NO_VERIFIED_SKU_RETURNED')
  if (reviewResult.status === 'rejected') missing.push('REVIEWS_READ_UNAVAILABLE')
  const time = (v: unknown) => `${String(object(v).hours ?? 0).padStart(2, '0')}:${String(object(v).minutes ?? 0).padStart(2, '0')}`
  const hours = list(object(profile.regularHours).periods).map(p => `${text(p.openDay)} ${time(p.openTime)} – ${text(p.closeDay)} ${time(p.closeTime)}`).join('; ')
  return { source: 'google_business_profile', resource, observedAt,
    profile: { name: text(profile.title), googleLocationName: text(profile.title), address: postalAddress(profile.storefrontAddress), phone: text(object(profile.phoneNumbers).primaryPhone), website: text(profile.websiteUri), description: text(object(profile.profile).description), googlePlaceId: text(object(profile.metadata).placeId), businessHours: hours },
    menu, reviewSummary: reviewResult.status === 'fulfilled' ? summarizeGoogleReviews(reviewResult.value, menu) : null, missing }
}
export function mergeGoogleMenu(existing: unknown, incoming: Obj[]) {
  const items = list(existing)
  const names = new Set(items.map(i => text(i.name).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')))
  const ids = new Set(items.map(i => i.id))
  const added = incoming.filter(i => !ids.has(i.id) && !names.has(text(i.name).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')))
  return { items: [...items, ...added], added: added.length }
}
