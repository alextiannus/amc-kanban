import type { AppRole } from '../permissions.ts'

/** Keep the priority used by the existing Kanban -> Content entry pages. */
export function selectContentRole(roles: readonly string[], allowResearcher?: false): 'ADMIN' | 'AMC_PRINCIPAL' | null
export function selectContentRole(roles: readonly string[], allowResearcher: boolean): 'ADMIN' | 'AMC_PRINCIPAL' | 'RESEARCHER' | null
export function selectContentRole(roles: readonly string[], allowResearcher = false): 'ADMIN' | 'AMC_PRINCIPAL' | 'RESEARCHER' | null {
  return roles.includes('ADMIN') ? 'ADMIN' : roles.includes('AMC_PRINCIPAL') ? 'AMC_PRINCIPAL'
    : allowResearcher && roles.includes('RESEARCHER') ? 'RESEARCHER' : null
}
export function isOverviewAdmin(principal: { source: string; globalRoles: AppRole[] } | null): boolean {
  return principal?.source === 'session' && principal.globalRoles.includes('ADMIN')
}
