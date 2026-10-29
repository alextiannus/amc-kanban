import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { SUBSCRIPTION_PLANS } from './catalog'
import { buildQuotation, quotationEmail, type QuotationSnapshot } from './quotation'
import { renderQuotationPdf } from './quotationPdf'
import { deliverQuotation, recoverQuotationLeases, QUOTATION_MAX_ATTEMPTS } from './quotationDelivery'

export async function queueSubscriptionQuotation(input: {
  subscriptionId: string; userId: string; recipient: string; customer: string
  brandName: string; address?: string; originalTotal?: number; companyName?: string; uen?: string
}) {
  // Read persisted commercial values. Reused requests cannot replace a saved
  // recipient, price, service snapshot or PDF through upsert's empty update.
  const saved = await prisma.subscriptionQuotation.findUnique({ where: { subscriptionId: input.subscriptionId }, select: { subscriptionId: true, state: true, snapshot: true } })
  if (saved) return { ...saved, number: (saved.snapshot as QuotationSnapshot).number }
  const subscription = await prisma.brandSubscription.findUnique({ where: { id: input.subscriptionId } })
  if (!subscription || subscription.createdById !== input.userId) throw new Error('Quotation subscription ownership mismatch')
  const plan = SUBSCRIPTION_PLANS.find(item => item.id === subscription.planId)
  if (!plan) throw new Error('Quotation plan unavailable')
  const snapshot = buildQuotation({ ...input, subscription, services: plan.includes })
  const savedQuote = await prisma.subscriptionQuotation.upsert({
    where: { subscriptionId: subscription.id }, update: {},
    create: { subscriptionId: subscription.id, recipient: snapshot.recipient, snapshot, state: 'PENDING' },
    select: { subscriptionId: true, state: true, snapshot: true },
  })
  return { ...savedQuote, number: (savedQuote.snapshot as QuotationSnapshot).number }
}

export async function dispatchSubscriptionQuotation(subscriptionId: string) {
  await deliverQuotation(subscriptionId, {
    database: prisma,
    render: renderQuotationPdf,
    send: async row => {
      const quote = row.snapshot as QuotationSnapshot
      return sendEmail({
        to: row.recipient, ...quotationEmail(quote),
        messageId: `<amc-quotation-${subscriptionId}@immedi.ai>`,
        attachments: [{ filename: `${quote.number}.pdf`, content: Buffer.from(row.pdf!), contentType: 'application/pdf' }],
      })
    },
  })
}

const globalState = globalThis as typeof globalThis & { quotationTimer?: ReturnType<typeof setInterval>; quotationRunning?: boolean }
export async function tickSubscriptionQuotations() {
  if (globalState.quotationRunning) return
  globalState.quotationRunning = true
  try {
    await recoverQuotationLeases(prisma)
    const rows = await prisma.subscriptionQuotation.findMany({
      where: { state: { in: ['PENDING', 'FAILED'] }, attempts: { lt: QUOTATION_MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
      select: { subscriptionId: true }, orderBy: { nextAttemptAt: 'asc' }, take: 10,
    })
    for (const row of rows) await dispatchSubscriptionQuotation(row.subscriptionId)
  } catch {
    // Do not log SMTP credentials, customer data, PDF contents or raw exceptions.
    console.error('[quotation] Worker failed; inspect persisted delivery states')
  } finally { globalState.quotationRunning = false }
}

export function startSubscriptionQuotationWorker() {
  if (globalState.quotationTimer) return
  globalState.quotationTimer = setInterval(() => { void tickSubscriptionQuotations() }, 30_000)
  globalState.quotationTimer.unref?.()
  void tickSubscriptionQuotations()
}
