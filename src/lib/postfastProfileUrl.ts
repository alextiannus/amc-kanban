import { publicHttpUrl } from './brandFollowLinks.ts'

/** Only provider-issued usernames qualify; display names and provider IDs do not. */
export function postfastProfileUrl(platform: string, username: unknown, explicitUrl?: unknown): string | null {
  const explicit = typeof explicitUrl === 'string' ? publicHttpUrl(explicitUrl) : null
  if (explicit) return explicit
  if (typeof username !== 'string') return null
  const handle = username.trim().replace(/^@/, '')
  if (platform === 'instagram' && /^[a-zA-Z0-9_][a-zA-Z0-9_.]{0,29}$/.test(handle) &&
      !['accounts', 'explore', 'reels', 'reel', 'p', 'stories', 'direct'].includes(handle.toLowerCase())) {
    return `https://www.instagram.com/${handle}/`
  }
  if (platform === 'tiktok' && /^[a-zA-Z0-9_][a-zA-Z0-9_.]{0,23}$/.test(handle) && !handle.endsWith('.')) {
    return `https://www.tiktok.com/@${handle}`
  }
  return null
}
