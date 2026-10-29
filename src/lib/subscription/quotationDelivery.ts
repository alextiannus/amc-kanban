import { randomUUID } from 'node:crypto'

export type DeliveryResult = { success: boolean; messageId?: string; error?: string; deliveryState?: 'NOT_SENT' | 'UNKNOWN' }
export type QuotationDeliveryRow = {
  subscriptionId: string; state: string; attempts: number; nextAttemptAt: Date; updatedAt: Date
  recipient: string; snapshot: unknown; pdf: Uint8Array | null; messageId: string | null
}
export type QuotationStore = {
  subscriptionQuotation: {
    findMany(args: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    updateMany(args: any): Promise<{ count: number }>
    update(args: any): Promise<any>
  }
}

export const QUOTATION_MAX_ATTEMPTS = 5
const LEASE_MS = 5 * 60_000

// State is claimed with one database CAS, so multiple Node workers cannot both
// dispatch. A stale SENDING lease is ambiguous, never permission to resend.
export async function deliverQuotation(
  subscriptionId: string,
  deps: { database: QuotationStore; send: (row: QuotationDeliveryRow) => Promise<DeliveryResult>; render: (snapshot: any) => Promise<Buffer>; now?: () => Date },
) {
  const now = deps.now?.() ?? new Date(), store = deps.database.subscriptionQuotation, leaseToken = randomUUID()
  const claimed = await store.updateMany({
    where: { subscriptionId, state: { in: ['PENDING', 'FAILED'] }, attempts: { lt: QUOTATION_MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
    data: { state: 'PREPARING', leaseToken, updatedAt: now },
  })
  if (!claimed.count) return
  let row: QuotationDeliveryRow
  try {
    row = await store.findUnique({ where: { subscriptionId } })
    if (!row.pdf) {
      const pdf = await deps.render(row.snapshot)
      const saved = await store.updateMany({ where: { subscriptionId, state: 'PREPARING', leaseToken }, data: { pdf } })
      if (!saved.count) return
      row = { ...row, pdf }
    }
  } catch {
    await store.updateMany({ where: { subscriptionId, state: 'PREPARING', leaseToken }, data: {
      state: 'FAILED', attempts: { increment: 1 }, lastError: 'PDF_PREPARATION_FAILED', nextAttemptAt: new Date(now.getTime() + 60_000),
    } })
    return
  }
  const sending = await store.updateMany({ where: { subscriptionId, state: 'PREPARING', leaseToken }, data: { state: 'SENDING', attempts: { increment: 1 }, updatedAt: deps.now?.() ?? new Date() } })
  if (!sending.count) return
  let result: DeliveryResult
  try { result = await deps.send(row!) } catch { result = { success: false, deliveryState: 'UNKNOWN' } }
  const data = result.success
    ? { state: 'SENT', messageId: result.messageId ?? null, sentAt: deps.now?.() ?? new Date(), lastError: null }
    : { state: result.deliveryState === 'NOT_SENT' ? 'FAILED' : 'UNKNOWN', lastError: result.deliveryState === 'NOT_SENT' ? 'SMTP_NOT_SENT' : 'SMTP_ACCEPTANCE_UNKNOWN', nextAttemptAt: new Date(now.getTime() + Math.min(3600, 30 * 2 ** row!.attempts) * 1000) }
  // If receipt persistence fails after SMTP accepted, SENDING expires to UNKNOWN.
  // Do not convert that database failure into a retryable send failure.
  await store.updateMany({ where: { subscriptionId, state: 'SENDING', leaseToken }, data })
}

export async function recoverQuotationLeases(database: QuotationStore, now = new Date()) {
  const expired = new Date(now.getTime() - LEASE_MS), store = database.subscriptionQuotation
  await store.updateMany({ where: { state: 'SENDING', updatedAt: { lt: expired } }, data: { state: 'UNKNOWN', lastError: 'SMTP_ACCEPTANCE_UNKNOWN' } })
  // PREPARING has not crossed the network boundary and is safe to retry.
  await store.updateMany({ where: { state: 'PREPARING', updatedAt: { lt: expired } }, data: { state: 'FAILED', nextAttemptAt: now, lastError: 'PREPARATION_INTERRUPTED' } })
}
