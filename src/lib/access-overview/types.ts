import type { AppRole } from '../permissions.ts'

export const CONTRACT_VERSION = 1
export const RULE_VERSION = '2026-09-17.1'
export const ROLES: AppRole[] = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD', 'RESEARCHER']
export const ROLE_LABELS: Record<string, string> = { ADMIN: '管理员', AMC_PRINCIPAL: '主理人', BRAND_OWNER: '品牌主', BD: 'BD', RESEARCHER: '研究员' }
export type State = 'allowed' | 'denied' | 'conditional' | 'comingSoon' | 'conflict' | 'unknown' | 'na'
export const STATE_LABELS: Record<State, string> = { allowed: '允许', denied: '禁止', conditional: '需满足条件', comingSoon: '待开放', conflict: '规则冲突', unknown: '未核实', na: '不适用' }
export type Check = { state: State; reason: string }
export type Operation = Check & { label: string; source: string; actionId?: string }
export type AccessEntry = {
  id: string; system: 'kanban' | 'content'; group: string; label: string; href?: string; aliases?: string[]
  moduleId?: string; parentId?: string
  menu: Check; page: Check; operations: Operation[]; scope: string; sources: string[]; status: State; notes: string[]
}
export type BrandScope = 'unselected' | 'allowed' | 'denied'
export type Context = { roles: AppRole[]; permissionRoleIds?: string[]; menuRoles?: AppRole[]; accountRoles?: AppRole[]; active?: boolean; brandScope?: BrandScope }
export type BrandOption = { id: string; name: string; sources: string[] }
export type Overview = {
  contractVersion: number; ruleVersion: string; generatedAt: string
  evidence: string; content: { state: 'available' | 'unavailable'; ruleVersion?: string; reason?: string }
  roles: string[]; roleCatalog?: import('../role-permissions/contract.ts').RoleDefinition[]; matrix?: Record<string, AccessEntry[]>; entries?: AccessEntry[]
  user?: { id: string; email: string; nickname: string | null; status: string; roles: string[]; assignedRoleIds?: string[]; menuRoles: string[]; roleSources: string[] }
  brands?: BrandOption[]; selectedBrandId?: string; conflicts: string[]
  policyVersions?: Record<string, number>
}
export function check(state: State, reason: string): Check { return { state, reason } }
export function entryStatus(menu: Check, page: Check): State {
  if (menu.state === 'comingSoon') return 'comingSoon'
  if (page.state === 'comingSoon') return 'comingSoon'
  if (menu.state === 'allowed' && page.state === 'denied') return 'conflict'
  if (page.state === 'allowed' && menu.state === 'denied') return 'conflict'
  if (page.state === 'unknown') return 'unknown'
  return page.state
}
