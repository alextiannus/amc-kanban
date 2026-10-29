import { createHash } from 'node:crypto'

export type QuotationSnapshot = {
  version: 1
  number: string
  subscriptionId: string
  issuedAt: string
  recipient: string
  customer: string
  companyName?: string
  uen?: string
  brandName: string
  address: string
  planName: string
  durationMonths: number
  services: string[]
  lines: { description: string; quantity: number; unitCents: number; amountCents: number }[]
  discountCents: number
  subtotalCents: number
  gstCents: number
  totalCents: number
  currency: 'SGD'
}

type Source = {
  id: string; createdAt: Date; planName: string; durationMonths: number; currency: string
  totalDueUsd: number; recurringAddonsUsd: number; oneTimeAddonsUsd: number
  selectedAddons: unknown
}

const clean = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
const cents = (value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) throw new Error('Invalid quotation amount')
  return Math.round(value * 100)
}

// Use the persisted order amount, never a browser price or a historical invoice price.
export function buildQuotation(input: {
  subscription: Source; recipient: string; customer: string; brandName: string; address?: string
  services: string[]; originalTotal?: number; companyName?: string; uen?: string
}): QuotationSnapshot {
  const { subscription: sub } = input
  const companyName = clean(input.companyName || '', 200)
  const uen = clean(input.uen || '', 32)
  const recipient = clean(input.recipient, 254).toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) throw new Error('A valid account email is required')
  if (sub.currency !== 'SGD') throw new Error('Quotation requires a persisted SGD order')
  if (!Number.isInteger(sub.durationMonths) || sub.durationMonths < 1) throw new Error('Invalid quotation duration')
  const subtotalCents = cents(sub.totalDueUsd)
  const originalCents = input.originalTotal === undefined ? subtotalCents : cents(input.originalTotal)
  if (originalCents < subtotalCents) throw new Error('Quotation discount does not reconcile')
  const addonLines: QuotationSnapshot['lines'] = []
  if (Array.isArray(sub.selectedAddons)) {
    for (const addon of sub.selectedAddons) {
      if (!addon || typeof addon !== 'object') throw new Error('Invalid quotation add-on')
      const item = addon as Record<string, unknown>
      const quantity = Number(item.quantity ?? 1) * (item.pricing === 'monthly' ? sub.durationMonths : 1)
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) throw new Error('Invalid add-on quantity')
      if (item.pricing !== 'monthly' && item.pricing !== 'one_time') throw new Error('Invalid add-on pricing')
      const unitCents = cents(Number(item.usd))
      if (quantity) addonLines.push({ description: clean(String(item.name || item.id), 300), quantity, unitCents, amountCents: unitCents * quantity })
    }
  }
  const addonCents = addonLines.reduce((sum, line) => sum + line.amountCents, 0)
  const storedAddonCents = cents(sub.recurringAddonsUsd * sub.durationMonths + sub.oneTimeAddonsUsd)
  if (addonCents !== storedAddonCents) throw new Error('Quotation add-ons do not reconcile with the order')
  // For a reused legacy order with no original-price snapshot, show the exact net
  // package amount. Do not invent a historical list price or discount.
  const baseCents = originalCents - addonCents
  if (baseCents < 0) throw new Error('Quotation package amount does not reconcile')
  const gstCents = Math.round(subtotalCents * 9 / 100)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sub.createdAt).replaceAll('-', '')
  const suffix = createHash('sha256').update(sub.id).digest('hex').slice(0, 20).toUpperCase()
  return {
    version: 1, number: `QT${date}-${suffix}`, subscriptionId: sub.id, issuedAt: sub.createdAt.toISOString(),
    recipient, companyName, uen, customer: companyName || clean(input.customer || input.brandName || recipient, 300),
    brandName: clean(input.brandName, 300), address: clean(input.address || '', 600),
    planName: clean(sub.planName, 200), durationMonths: sub.durationMonths,
    services: input.services.map(value => clean(value, 1200)),
    lines: [{ description: `${clean(sub.planName, 200)} - ${sub.durationMonths}-month license`, quantity: 1, unitCents: baseCents, amountCents: baseCents }, ...addonLines],
    discountCents: originalCents - subtotalCents, subtotalCents, gstCents, totalCents: subtotalCents + gstCents, currency: 'SGD',
  }
}

export const quotationMoney = (value: number) => (value / 100).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function quotationEmail(quote: QuotationSnapshot) {
  const text = `Dear ${quote.customer},\n\nYour AMC subscription request has been submitted. Your quotation ${quote.number} is attached.\n\nBrand: ${quote.brandName}\nPlan: ${quote.planName}\nTerm: ${quote.durationMonths} months\nSubtotal: SGD ${quotationMoney(quote.subtotalCents)}\nGST (9%): SGD ${quotationMoney(quote.gstCents)}\nQuotation total: SGD ${quotationMoney(quote.totalCents)}\n\nThis quotation is valid for 30 days from the quotation date.\n\nThis quotation is not a tax invoice or confirmation of payment. Payment and activation follow your subscription order.\n\nDELIVERYCHINATOWN PTE. LTD.\nUEN / GST Reg No: 201835327N`
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  return { subject: `AMC Quotation ${quote.number}`, text, html: `<div style="font-family:Arial,sans-serif;line-height:1.7;white-space:pre-wrap">${escaped}</div>` }
}
