export const GLOBAL_ROLES = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD'] as const

export type GlobalRole = (typeof GLOBAL_ROLES)[number]
export type ActorType = 'HUMAN' | 'AMC_AGENT'
export type AuthSource = 'session' | 'api_key' | 'legacy_api_key'

export type AuthPrincipal = {
  userId: string
  email?: string
  actorType: ActorType
  globalRoles: GlobalRole[]
  authVersion: number
  credentialId?: string
  source: AuthSource
}

export type PrincipalUserRecord = {
  id: string
  email: string
  type: string
  role: string
  status: string
  authVersion: number
  businessRoles: Array<{ role: string }>
}

export function normalizeActorType(type: string | null | undefined): ActorType {
  return type === 'AI_AGENT' ? 'AMC_AGENT' : 'HUMAN'
}

export function normalizeGlobalRoles(
  roles: Array<{ role: string }> | string[],
  legacySystemRole?: string | null,
): GlobalRole[] {
  const normalized = new Set<GlobalRole>()
  for (const entry of roles) {
    const role = typeof entry === 'string' ? entry : entry.role
    if ((GLOBAL_ROLES as readonly string[]).includes(role)) {
      normalized.add(role as GlobalRole)
    }
  }

  // Transitional safety until the ADMIN role backfill migration has run.
  if (legacySystemRole === 'ADMIN') normalized.add('ADMIN')
  return Array.from(normalized)
}

export function principalFromUser(
  user: PrincipalUserRecord,
  source: AuthSource,
  credentialId?: string,
): AuthPrincipal {
  return {
    userId: user.id,
    email: user.email,
    actorType: normalizeActorType(user.type),
    globalRoles: normalizeGlobalRoles(user.businessRoles, user.role),
    authVersion: user.authVersion,
    credentialId,
    source,
  }
}
