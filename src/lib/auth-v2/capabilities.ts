import type { GlobalRole } from './types'

export const CAPABILITIES = [
  'brand.read',
  'brand.create',
  'brand.update',
  'brand.archive',
  'asset.read',
  'asset.create',
  'asset.update',
  'asset.archive',
  'draft.read',
  'draft.create',
  'draft.update',
  'draft.submit',
  'draft.approve',
  'draft.reject',
  'content.schedule',
  'content.publish',
  'content.retry',
  'review.read',
  'review.reply',
  'action_item.read',
  'action_item.create',
  'action_item.resolve',
  'agent.manage',
  'user.manage',
  'subscription.manage',
  'system.configure',
  'work_log.read',
] as const

export type Capability = (typeof CAPABILITIES)[number]

const BRAND_OPERATOR_CAPABILITIES: readonly Capability[] = [
  'brand.read',
  'brand.update',
  'asset.read',
  'asset.create',
  'asset.update',
  'asset.archive',
  'draft.read',
  'draft.create',
  'draft.update',
  'draft.submit',
  'draft.approve',
  'draft.reject',
  'content.schedule',
  'content.publish',
  'content.retry',
  'review.read',
  'review.reply',
  'action_item.read',
  'action_item.create',
  'action_item.resolve',
  'work_log.read',
]

export const ROLE_CAPABILITIES: Record<GlobalRole, readonly Capability[]> = {
  ADMIN: CAPABILITIES,
  AMC_PRINCIPAL: [...BRAND_OPERATOR_CAPABILITIES, 'brand.create', 'agent.manage'],
  BRAND_OWNER: BRAND_OPERATOR_CAPABILITIES,
  BD: ['brand.read', 'brand.create', 'subscription.manage'],
}

export function hasCapability(roles: readonly GlobalRole[], capability: Capability): boolean {
  return roles.some((role) => ROLE_CAPABILITIES[role].includes(capability))
}
