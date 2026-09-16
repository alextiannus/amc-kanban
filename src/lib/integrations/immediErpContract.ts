import type { ErpOrderItem, ImmediErpConfig, SubscriptionSummary } from './immediErp'

// One contract line per purchased service. Amounts represent the whole term.
// Distribute any subscription discount proportionally in integer cents.
export function buildOrderItems(sub: SubscriptionSummary & { monthlyBaseUsd?: number }, cfg: ImmediErpConfig): ErpOrderItem[] {
  if (!Number.isInteger(sub.durationMonths) || sub.durationMonths <= 0 || !Number.isFinite(sub.totalDueUsd) || sub.totalDueUsd <= 0) {
    throw new Error('A positive paid contract value and duration are required; waived subscriptions require ERP review')
  }
  const addons = Array.isArray(sub.selectedAddons) ? sub.selectedAddons : []
  const lines: Array<{ id: string; value: number }> = []
  for (const addon of addons) {
    if (!addon || typeof addon.id !== 'string' || !['monthly', 'one_time'].includes(addon.pricing)
      || !Number.isFinite(addon.usd) || addon.usd < 0 || !Number.isInteger(addon.quantity ?? 1) || (addon.quantity ?? 1) < 1) throw new Error('Invalid subscription addon')
    lines.push({ id: addon.id, value: addon.usd * (addon.quantity ?? 1) * (addon.pricing === 'monthly' ? sub.durationMonths : 1) })
  }
  const addonTotal = lines.reduce((sum, line) => sum + line.value, 0)
  const base = sub.monthlyBaseUsd === undefined ? sub.totalDueUsd - addonTotal : sub.monthlyBaseUsd * sub.durationMonths
  if (base < 0 || !Number.isFinite(base)) throw new Error('Subscription base price is inconsistent')
  lines.unshift({ id: sub.planId, value: base })
  const nonzero = lines.filter(line => line.value > 0)
  const gross = nonzero.reduce((sum, line) => sum + line.value, 0)
  if (!gross) throw new Error('No billable subscription services')
  const totalCents = Math.round(sub.totalDueUsd * 100)
  let allocated = 0
  return nonzero.map((line, index) => {
    const code = cfg.itemCodeMap[line.id]
    if (!code) throw new Error(`Missing ERP SKU mapping: ${line.id}`)
    const cents = index === nonzero.length - 1 ? totalCents - allocated : Math.floor(totalCents * line.value / gross)
    allocated += cents
    if (cents <= 0) throw new Error('Discount leaves a zero-value service; ERP review required')
    return { item_code: code, quantity: 1, rate: cents / 100, amount: cents / 100, cost_center: cfg.costCenter || 'Main - IMD' }
  })
}
