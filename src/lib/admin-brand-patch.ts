import type { BrandRecord } from '@/components/admin/BrandsTab'

// Do not send untouched subscription fields when saving a principal: the
// legacy subscription updater interprets those fields as a billing edit.
export function buildAdminBrandPatch(brand: BrandRecord, draft: Record<string, unknown>) {
  const subscription = brand.subscriptions[0]
  const original: Record<string, unknown> = {
    name: brand.name, location: brand.location || '', timezone: brand.timezone || 'Asia/Singapore', status: brand.status,
    ownerUserId: brand.owners[0]?.userId || '', agentIds: brand.brandAgents.map(link => link.agentId),
    planId: subscription?.planId || '', subscriptionStatus: subscription?.status || '',
    durationMonths: subscription?.durationMonths || 12, feeWaived: subscription?.feeWaived || false,
    contractStartDate: subscription?.contractStartDate, contractEndDate: subscription?.contractEndDate,
  }
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined) continue
    const normalize = (v: unknown) => key === 'agentIds' && Array.isArray(v) ? [...v].sort() : v
    if (JSON.stringify(normalize(value)) !== JSON.stringify(normalize(original[key]))) patch[key] = value
  }
  if (['planId', 'subscriptionStatus', 'durationMonths', 'feeWaived', 'contractStartDate', 'contractEndDate'].some(key => key in patch)) {
    Object.assign(patch, {
      planId: ['starter', 'essential', 'booster'].includes(String(draft.planId)) ? draft.planId : 'essential',
      subscriptionStatus: draft.subscriptionStatus || 'ACTIVE', durationMonths: draft.durationMonths || 12,
      feeWaived: draft.feeWaived || false,
      contractStartDate: draft.contractStartDate ?? subscription?.contractStartDate,
      contractEndDate: draft.contractEndDate ?? subscription?.contractEndDate,
    })
  }
  return patch
}
