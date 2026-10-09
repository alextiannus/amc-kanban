import { createHash } from 'node:crypto'

/** The whole envelope is stored in the existing encrypted ModelConnection secret. */
export type KopixCredential = { apiKey: string; accessKey?: string; secretKey?: string; projectName: string; portraitModels: string[] }
export function parseKopixCredential(secret: string): KopixCredential {
  if (!secret.trim().startsWith('{')) return { apiKey: secret.trim(), projectName: 'default', portraitModels: [] }
  let value: any
  try { value = JSON.parse(secret) } catch { throw new Error('Invalid Kopix credential envelope') }
  if (typeof value.apiKey !== 'string' || !value.apiKey.trim()
    || typeof value.accessKey !== 'string' || !value.accessKey.trim()
    || typeof value.secretKey !== 'string' || !value.secretKey.trim()
    || (value.projectName !== undefined && (typeof value.projectName !== 'string' || !/^[\w-]{1,100}$/.test(value.projectName)))
    || (value.portraitModels !== undefined && (!Array.isArray(value.portraitModels) || value.portraitModels.some((m: unknown) => typeof m !== 'string' || !m || m.length > 200)))) {
    throw new Error('Kopix envelope requires apiKey, accessKey, secretKey and an optional portraitModels list')
  }
  return { apiKey: value.apiKey.trim(), accessKey: value.accessKey.trim(), secretKey: value.secretKey.trim(),
    projectName: value.projectName || 'default', portraitModels: value.portraitModels || [] }
}
export function kopixAccountKey(credential: KopixCredential, baseUrl: string) {
  if (!credential.accessKey) throw new Error('Configure Kopix AK/SK in the encrypted model connection')
  return createHash('sha256').update(`${new URL(baseUrl).origin}\n${credential.accessKey}\n${credential.projectName}`).digest('hex')
}
