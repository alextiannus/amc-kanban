import { PERMISSION_MODULES } from '../role-permissions/contract.ts'
import type { AccessEntry } from './types.ts'

export type ModuleGroup = { id: string; label: string; system: 'kanban' | 'content'; entries: AccessEntry[]; primary: AccessEntry; fixed: boolean; comingSoon: boolean }
export function groupAccessEntries(entries: AccessEntry[]): ModuleGroup[] {
  const groups = new Map<string, ModuleGroup>()
  for (const entry of entries) {
    const module = PERMISSION_MODULES.find(item => item.id === entry.moduleId)
    const id = module ? `module:${module.id}` : entry.id
    const existing = groups.get(id)
    if (existing) existing.entries.push(entry)
    else groups.set(id, { id, label: module?.label || entry.label, system: module?.system || entry.system, entries: [entry], primary: entry, fixed: !module, comingSoon: false })
  }
  for (const group of groups.values()) {
    // Prefer the destination page over a cross-service jump or detail page.
    group.primary = group.entries.find(entry => entry.id === entry.moduleId) || group.entries.find(entry => entry.moduleId?.startsWith('content.') && entry.id === `content:${entry.moduleId.slice(8)}`) || group.entries.find(entry => entry.system === group.system && !entry.id.includes('legacy-')) || group.entries[0]
    group.comingSoon = group.entries.every(entry => entry.status === 'comingSoon')
  }
  return [...groups.values()]
}
export function matchesAccessGroup(group: ModuleGroup, system: string, query: string, filter: string): boolean {
  if (system !== 'all' && group.system !== system) return false
  const text = [group.label, group.system, ...group.entries.flatMap(e => [e.label, e.group, e.href || '', ...(e.aliases || [])])].join(' ').toLowerCase()
  if (!text.includes(query.trim().toLowerCase())) return false
  if (filter === 'all') return true
  return group.entries.some(e => filter === 'available' ? ['allowed', 'conditional'].includes(e.page.state)
    : filter === 'anomaly' ? [e.status, e.menu.state, e.page.state, ...e.operations.map(op => op.state)].some(state => ['conflict', 'unknown'].includes(state))
    : e.page.state === filter)
}
