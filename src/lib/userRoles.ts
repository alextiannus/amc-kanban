export type BusinessRole = 'BRAND_OWNER' | 'AMC_PRINCIPAL'
export type EffectiveUserRole = 'ADMIN' | BusinessRole | 'AMC_AGENT'

export function computeEffectiveUserRoles(input: {
  userType: string | null | undefined
  systemRole: string | null | undefined
  explicitRoles?: string[]
  ownerCount?: number
  principalCount?: number
}): EffectiveUserRole[] {
  if (input.userType === 'AI_AGENT') return ['AMC_AGENT']

  const roles = new Set<EffectiveUserRole>()
  const explicitRoles = input.explicitRoles || []
  const ownerCount = input.ownerCount || 0
  const principalCount = input.principalCount || 0

  if (input.systemRole === 'ADMIN') roles.add('ADMIN')
  if (explicitRoles.includes('BRAND_OWNER') || ownerCount > 0) roles.add('BRAND_OWNER')
  if (explicitRoles.includes('AMC_PRINCIPAL') || principalCount > 0) roles.add('AMC_PRINCIPAL')

  return Array.from(roles)
}

export function getLegacyDashboardRole(roles: EffectiveUserRole[]): 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR' {
  if (roles.includes('ADMIN')) return 'ADMIN'
  if (roles.includes('BRAND_OWNER')) return 'BRAND_OWNER'
  return 'BRAND_DIRECTOR'
}
