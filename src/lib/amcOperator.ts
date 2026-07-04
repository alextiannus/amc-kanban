type UserRoleLike = {
  type?: string | null
  role?: string | null
}

export const SYSTEM_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || 'alextiannus@gmail.com'

export function isSystemAdminEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL
}

/**
 * Phase 1 role mapping:
 * HUMAN + ADMIN => AMC operator.
 */
export function isAmcOperator(user: UserRoleLike | null | undefined): boolean {
  if (!user) return false
  return user.role === 'ADMIN'
}

/**
 * Lightweight variant for callsites that only carry role.
 * Use when caller already guarantees HUMAN context.
 */
export function isAmcOperatorRole(role: string | null | undefined): boolean {
  return role === 'ADMIN'
}
