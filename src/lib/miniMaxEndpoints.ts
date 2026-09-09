// TTS, source uploads and cloning must use the same account region.
export const DEFAULT_MINIMAX_TTS_ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'

export function miniMaxVoiceEndpoint(baseUrl: string | null | undefined, path: string): string {
  const url = new URL(baseUrl || DEFAULT_MINIMAX_TTS_ENDPOINT)
  url.pathname = path
  url.search = ''
  url.hash = ''
  return url.toString()
}
