export const PERMANENT_GAME_ORIGIN = 'https://amc.immedi.ai'

export const PERMANENT_GAME_QR_OPTIONS = {
  width: 640,
  margin: 1,
  errorCorrectionLevel: 'M' as const,
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
}

export function getPermanentGameUrl(brandId: string, storeId?: string): string {
  return `${PERMANENT_GAME_ORIGIN}/game/${encodeURIComponent(brandId)}${storeId ? `?store=${encodeURIComponent(storeId)}` : ''}`
}

export function getPermanentPosterUrl(brandId: string, storeId?: string): string {
  return `${PERMANENT_GAME_ORIGIN}/board/game/poster/${encodeURIComponent(brandId)}${storeId ? `?store=${encodeURIComponent(storeId)}` : ''}`
}
