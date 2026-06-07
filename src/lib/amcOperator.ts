type UserRoleLike = {
  type?: string | null
  role?: string | null
}

/**
 * Phase 1 role mapping:
 * HUMAN + ADMIN => AMC operator.
 */
export function isAmcOperator(user: UserRoleLike | null | undefined): boolean {
  if (!user) return false
  return user.type !== 'AI_AGENT' && user.role === 'ADMIN'
}

/**
 * Lightweight variant for callsites that only carry role.
 * Use when caller already guarantees HUMAN context.
 */
export function isAmcOperatorRole(role: string | null | undefined): boolean {
  return role === 'ADMIN'
}
