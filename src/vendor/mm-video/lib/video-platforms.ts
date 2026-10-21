import {COPYWRITER_ROSTER} from '@/vendor/mm-video/lib/copywriters'

// Keep the choices aligned with the existing image/post editor and draft API.
export const VIDEO_PLATFORMS = COPYWRITER_ROSTER.map(writer => writer.platform)
export function videoPlatforms(value: unknown, fallback = 'tiktok'): string[] {
  const aliases: Record<string,string> = {google:'google_business',rednote:'xiaohongshu',xhs:'xiaohongshu'}
  const normalize = (item: unknown) => typeof item === 'string' ? aliases[item.toLowerCase()] || item.toLowerCase() : ''
  const selected = Array.isArray(value) ? [...new Set(value.map(normalize))].filter(p => VIDEO_PLATFORMS.includes(p as typeof VIDEO_PLATFORMS[number])) : []
  if (selected.length) return selected
  const primary = normalize(fallback)
  return [VIDEO_PLATFORMS.includes(primary as typeof VIDEO_PLATFORMS[number]) ? primary : 'tiktok']
}
