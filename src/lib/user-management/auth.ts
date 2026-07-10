import { authenticateApiKey } from '../auth-v2/api-key.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
export {
  decrypt,
  encrypt,
  extractApiKey,
  getSession,
  type Session,
  type SessionUser,
} from '../auth.ts'

export type DelegatedSessionUser = {
  id: string
  email?: string
  nickname?: string | null
  role: string
  type: string
  userRoles: string[]
}

function userFromPrincipal(principal: AuthPrincipal): DelegatedSessionUser {
  return {
    id: principal.userId,
    email: principal.email,
    role: principal.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER',
    type: 'HUMAN',
    userRoles: principal.globalRoles,
  }
}

/** Resolve any User API key directly to its owning system user. */
export async function verifyUserApiKey(token: string): Promise<DelegatedSessionUser | null> {
  const principal = await authenticateApiKey(token)
  return principal ? userFromPrincipal(principal) : null
}

export type AuthContext = {
  user: DelegatedSessionUser
  agentId: string | null
  principal: AuthPrincipal
}

/** Resolve a cookie session or API key through the single Auth V2 path. */
export async function resolveSessionOrApiKey(request: Request): Promise<AuthContext | null> {
  const { authenticateRequest } = await import('../auth-v2/authenticate.ts')
  const principal = await authenticateRequest(request)
  if (!principal) return null
  return {
    user: userFromPrincipal(principal),
    agentId: null,
    principal,
  }
}
