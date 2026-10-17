export const BRAND_ACCOUNTS_CHANGED = 'amc:brand-accounts-changed'
export function notifyBrandAccountsChanged(brandId: string) {
  window.dispatchEvent(new CustomEvent(BRAND_ACCOUNTS_CHANGED, { detail: { brandId } }))
}
