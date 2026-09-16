// MiniMax file IDs can exceed Number.MAX_SAFE_INTEGER. Keep their decimal
// representation intact in memory/database and emit numeric JSON only on wire.
export function parseMiniMaxVoiceJson(raw: string): any {
  return JSON.parse(raw.replace(
    /("file_id"\s*:\s*)(\d+)(?=\s*[,}])|"(?:\\.|[^"\\])*"/g,
    (token, prefix, digits) => prefix ? `${prefix}"${digits}"` : token,
  ))
}

export function miniMaxFileId(value: unknown): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error('MiniMax file_id lost precision; upload the recording again')
  }
  const id = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  if (!/^[1-9]\d*$/.test(id)) throw new Error('MiniMax upload succeeded but returned no valid file_id')
  return id
}

export function miniMaxVoiceBody(body: object): string {
  const data = { ...body } as Record<string, unknown>
  if ('file_id' in data) data.file_id = miniMaxFileId(data.file_id)
  return JSON.stringify(data).replace(
    /("file_id"\s*:\s*)"([1-9]\d*)"|"(?:\\.|[^"\\])*"/g,
    (token, prefix, digits) => prefix ? `${prefix}${digits}` : token,
  )
}

export async function readMiniMaxVoiceResponse(response: Response, stage: string, apiKey = '') {
  let payload: any
  try { payload = parseMiniMaxVoiceJson(await response.text()) } catch {
    throw new Error(`MiniMax ${stage}: HTTP ${response.status}, non-JSON response`)
  }
  const code = payload?.base_resp?.status_code
  const hasCode = typeof code === 'number' || (typeof code === 'string' && /^\d+$/.test(code))
  const rejected = hasCode && Number(code) !== 0
  if (!response.ok || !payload || !hasCode || rejected) {
    const detail = payload?.base_resp?.status_msg || payload?.error?.message ||
      (typeof payload?.error === 'string' ? payload.error : '') || 'Invalid provider response'
    const safeDetail = (apiKey ? String(detail).split(apiKey).join('[REDACTED]') : String(detail))
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/[\r\n]+/g, ' ').slice(0, 300)
    throw Object.assign(new Error(`MiniMax ${stage}: HTTP ${response.status}${hasCode ? `, code ${code}` : ''}: ${safeDetail}`), { remoteRejected: rejected })
  }
  return payload
}
