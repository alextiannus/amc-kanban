export function safeBrandColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(hex)) return '#' + hex.slice(1).split('').map(c => c + c).join('').toLowerCase()
  return null
}

export function configuredBrandColor(solution: unknown): string | null {
  if (!solution || typeof solution !== 'object' || Array.isArray(solution)) return null
  const theme = (solution as Record<string, unknown>).presentationTheme
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return null
  return safeBrandColor((theme as Record<string, unknown>).primary)
}

function mix(color: string, target: number, amount: number) {
  return '#' + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) + target * amount).toString(16).padStart(2, '0')).join('')
}
function luminance(color: string) {
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0)
}
export function brandEntryTheme(value: unknown) {
  const primary = safeBrandColor(value) || '#334155'
  let ink = primary
  // Keep branded text readable even for white, yellow and pastel palettes.
  while (1.05 / (luminance(ink) + .05) < 7) ink = mix(ink, 0, .12)
  return { primary, ink, background: mix(primary, 255, .96), tint: mix(primary, 255, .90), border: mix(primary, 255, .78) }
}
