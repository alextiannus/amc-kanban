export function multiStoreQuantity(value: unknown): number {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  let quantity: unknown = Array.isArray(value)
    ? value.find(v => record(v) && v.id === 'multi_store')?.quantity
    : record(value) ? value.multi_store : 0
  if (record(quantity)) quantity = quantity.quantity
  if (quantity === true) return 1
  return typeof quantity === 'number' && Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
}

export function effectiveStoreLimit(subscriptionLimit: number, manualLimit: number | null) {
  return Math.max(1, subscriptionLimit, manualLimit ?? 0)
}

export class StoreEntitlementError extends Error {
  constructor(message: string, public code = 'STORE_LIMIT_EXCEEDED', public status = 409) { super(message) }
}

export function validateManualStoreLimit(value: unknown): asserts value is number | null {
  if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647)) {
    throw new StoreEntitlementError('门店授权总数必须为正整数，或清除授权恢复订阅额度', 'INVALID_STORE_LIMIT', 400)
  }
}

export function assertStoreCount(nextCount: number, currentCount: number, limit: number) {
  if (nextCount > Math.max(currentCount, limit)) {
    throw new StoreEntitlementError(`当前支持 ${limit} 家门店，已有 ${currentCount} 家，本次提交 ${nextCount} 家。请联系管理员调整额度或购买多门店支持`)
  }
}

export function normalizeStoreRecords(value: unknown, previous: unknown = []): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) {
    throw new StoreEntitlementError('门店资料必须为对象数组', 'INVALID_STORES', 400)
  }
  const old = Array.isArray(previous) ? previous.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : []
  const used = new Set<string>()
  return value.map((store: Record<string, unknown>) => {
    const explicitId = typeof store.storeId === 'string' ? store.storeId.trim() : ''
    const matches = old.filter(v => explicitId ? v.storeId === explicitId
      : store.locationKey ? store.locationKey === v.locationKey
      : (store.address && store.address === v.address) || (store.name && store.name === v.name))
    const existing = matches.length === 1 ? matches[0] : undefined
    const storeId = explicitId || existing?.storeId || `store-${globalThis.crypto.randomUUID()}`
    if (used.has(storeId)) throw new StoreEntitlementError('门店标识重复，请刷新后重试', 'DUPLICATE_STORE_ID', 400)
    used.add(storeId)
    return { ...existing, ...store, storeId }
  })
}
