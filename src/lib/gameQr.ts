export const PERMANENT_GAME_ORIGIN = 'https://amc-kanban.immedi.ai'

export const PERMANENT_GAME_QR_OPTIONS = {
  width: 640,
  margin: 1,
  errorCorrectionLevel: 'M' as const,
  color: {
    dark: '#000000',
    light: '#ffffff',
  },
}

export function getPermanentGameUrl(brandId: string): string {
  return `${PERMANENT_GAME_ORIGIN}/game/${encodeURIComponent(brandId)}`
}

export function getPermanentPosterUrl(brandId: string): string {
  return `${PERMANENT_GAME_ORIGIN}/board/game/poster/${encodeURIComponent(brandId)}`
}
