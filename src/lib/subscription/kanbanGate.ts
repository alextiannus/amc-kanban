export type BrandSubscriptionSummary = { status?: string; contractEndDate?: string | null }
export type GateBrand = { status?: string | null; subscriptions?: BrandSubscriptionSummary[] }

export function hasActiveBrandSubscription(brands: GateBrand[], now = Date.now()) {
  return brands.some(brand => (!brand.status || brand.status === 'ACTIVE') && brand.subscriptions?.some(subscription =>
    subscription.status === 'ACTIVE' && (!subscription.contractEndDate || new Date(subscription.contractEndDate).getTime() > now)
  ))
}

export function needsBrandSubscriptionGate(roles: string[], permissions: string[]) {
  return !roles.includes('ADMIN') && !roles.includes('AMC_PRINCIPAL') && permissions.includes('brand.read')
}
