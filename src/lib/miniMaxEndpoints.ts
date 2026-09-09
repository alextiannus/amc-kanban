// AMC uses the merchant's domestic MiniMax account only.
export const DEFAULT_MINIMAX_TTS_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'

export function miniMaxVoiceEndpoint(baseUrl: string | null | undefined, path: string): string {
  const url = new URL(baseUrl || DEFAULT_MINIMAX_TTS_ENDPOINT)
  if (url.origin !== 'https://api.minimaxi.com' || url.username || url.password) {
    throw new Error('MINIMAX_DOMESTIC_ENDPOINT_REQUIRED: 请使用国内地址 https://api.minimaxi.com/v1/t2a_v2')
  }
  url.pathname = path
  url.search = ''
  url.hash = ''
  return url.toString()
}
