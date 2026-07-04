export type BusinessRole = 'BRAND_OWNER' | 'AMC_PRINCIPAL' | 'BD'
export type EffectiveUserRole = 'ADMIN' | BusinessRole

export function computeEffectiveUserRoles(input: {
  userType: string | null | undefined
  systemRole: string | null | undefined
  explicitRoles?: string[]
  ownerCount?: number
  principalCount?: number
}): EffectiveUserRole[] {
  const roles = new Set<EffectiveUserRole>()
  const explicitRoles = input.explicitRoles || []

  // Transitional fallback until User.role is removed after Auth V2 cutover.
  if (input.systemRole === 'ADMIN') roles.add('ADMIN')
  if (explicitRoles.includes('ADMIN')) roles.add('ADMIN')
  if (explicitRoles.includes('BRAND_OWNER')) roles.add('BRAND_OWNER')
  if (explicitRoles.includes('AMC_PRINCIPAL')) roles.add('AMC_PRINCIPAL')
  if (explicitRoles.includes('BD')) roles.add('BD')

  return Array.from(roles)
}

export function getLegacyDashboardRole(roles: EffectiveUserRole[]): 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR' {
  if (roles.includes('ADMIN')) return 'ADMIN'
  if (roles.includes('BRAND_OWNER')) return 'BRAND_OWNER'
  return 'BRAND_DIRECTOR'
}
