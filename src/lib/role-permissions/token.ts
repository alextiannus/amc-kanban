import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthPrincipal } from '../auth-v2/types.ts'
export function labSecret() { return process.env.AMC_CONTENT_LAB_TOKEN_SECRET?.trim() || process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() }
export function signAccessIdentity(principal: AuthPrincipal, brandId?: string) {
  const secret = labSecret()
  if (!secret) throw new Error('Content identity signing is not configured')
  const payload = Buffer.from(JSON.stringify({ sub: principal.userId, email: principal.email, role: principal.globalRoles.includes('ADMIN') ? 'ADMIN' : (principal.permissionRoleIds || principal.globalRoles)[0], authVersion: principal.authVersion, brandId, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
export function verifyAccessIdentity(token: unknown): { sub: string; authVersion: number; brandId?: string } | null {
  const secret = labSecret()
  if (typeof token !== 'string' || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const signature = createHmac('sha256', secret).update(parts[0]).digest('base64url')
  const suppliedSignature = Buffer.from(parts[1])
  const expectedSignature = Buffer.from(signature)
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) return null
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    return typeof p.sub === 'string' && Number.isSafeInteger(p.authVersion) && p.authVersion > 0 && Number.isFinite(p.exp) && p.exp > Date.now()/1000 && (p.brandId === undefined || typeof p.brandId === 'string') ? p : null
  } catch { return null }
}
