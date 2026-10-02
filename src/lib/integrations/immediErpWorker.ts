import {isPaidSubscription,resolvePrincipal,orderCustomer,brandInclude} from './immediOrders'
import crypto from 'node:crypto'
import { prisma } from '../prisma'
import { buildOrderItems } from './immediErpContract'
import { createSalesOrder, erpPost, getImmediErpConfig, type ImmediErpConfig } from './immediErp'

const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const globalState = globalThis as typeof globalThis & { immediErpTimer?: ReturnType<typeof setInterval>; immediErpRunning?: boolean }

// Network effects are performed under a transaction-scoped lock. Receipts commit
// with the result; a lost commit is recovered by the same ERP idempotency key.
export async function withReceipt(kind: string, sourceId: string, execute: (tx: any, row: any) => Promise<any>, database: any = prisma) {
  const id = `${kind}:${sourceId}`
  return database.$transaction(async (tx: any) => {
    const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${id})) AS acquired`
    if (!lock.acquired) return null
    const row = await tx.immediErpSync.upsert({ where: { id }, create: { id, kind, sourceId }, update: {} })
    if (row.status === 'FAILED' && row.nextAttemptAt > new Date()) return row
    try {
      return await execute(tx, row)
    } catch (error) {
      return tx.immediErpSync.update({ where: { id }, data: {
        status: 'FAILED', attempts: { increment: 1 }, lastError: String(error instanceof Error ? error.message : error).slice(0, 2000),
        nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7)) * 1000),
      } })
    }
  }, { maxWait: 5000, timeout: 240_000 })
}

export async function syncSubscription(subscriptionId: string, config?: ImmediErpConfig, {database=prisma,send=createSalesOrder}: {database?: any;send?: typeof createSalesOrder} = {}) {
  const cfg = config || await getImmediErpConfig()
  if (!cfg) return null
  // Commit the immutable source/ownership snapshot before dispatching any network write.
  await withReceipt('SUBSCRIPTION', subscriptionId, async (tx, row) => {
    if (row.payload || row.reference) return row
    const sub = await tx.brandSubscription.findUnique({ where: { id: subscriptionId }, include: { brand: { include: brandInclude } } })
    if (!sub?.brand || !isPaidSubscription(sub)) throw new Error('订阅尚未确认付款、已豁免或缺少品牌；不会作为付费订阅同步')
    const delivery = sub.contractEndDate || new Date(Date.UTC(sub.createdAt.getUTCFullYear(), sub.createdAt.getUTCMonth() + sub.durationMonths, sub.createdAt.getUTCDate()))
    const customer = sub.brand.ownerId ? await tx.user.findUnique({where:{id:sub.brand.ownerId},select:{email:true,nickname:true}}) : sub.brand.owner
    const input = {
      idempotencyKey: 'amc-sub-' + sub.id, ...orderCustomer(sub.brand, customer),
      principal_employee_id: resolvePrincipal(sub.brand, cfg),
      items: buildOrderItems(sub, cfg), amount: sub.totalDueUsd, currency: sub.currency,
      sales_date: sub.createdAt.toISOString().slice(0, 10), delivery_date: delivery.toISOString().slice(0, 10),
      amc_source: { kind: 'subscription', id: sub.id, brand_id: sub.brandId, plan_id: sub.planId,
        subscription_status: 'ACTIVE', fee_waived: false, payment_status: 'paid', payment_basis: 'active_paid_subscription', paid_at: sub.paidAt?.toISOString() || null, payment_provider: sub.paymentProvider || 'AMC_ADMIN_CONFIRMATION',
        payment_reference: sub.paymentSessionId || sub.id,
        contract_start: sub.contractStartDate?.toISOString() || null, contract_end: sub.contractEndDate?.toISOString() || null },
    }
    return tx.immediErpSync.update({ where: { id: row.id }, data: { payload: input, payloadHash: digest(input), status: 'PENDING', lastError: null, nextAttemptAt: new Date() } })
  }, database)
  return withReceipt('SUBSCRIPTION', subscriptionId, async (tx, row) => {
    if (row.reference) return row
    if (!row.payload) throw new Error('等待完整且已确认的订阅快照')
    const order = await send(cfg, row.payload)
    if (!order.ok || !order.erpOrderName) throw new Error(order.error || 'Missing ERP Sales Order receipt')
    return tx.immediErpSync.update({ where: { id: row.id }, data: { status: 'SYNCED', reference: order.erpOrderName, lastError: null, attempts: 0 } })
  }, database)
}

export async function syncServiceOrder(orderId: string, cfg: ImmediErpConfig) {
  return withReceipt('ORDER', orderId, async (tx, row) => {
    if (row.status === 'SYNCED' && row.reference) return row
    const source = await tx.immediServiceOrder.findUnique({ where: { id: orderId } })
    if (!source) throw new Error('服务订单不存在')
    const order = await createSalesOrder(cfg, source.payload as any)
    if (!order.ok || !order.erpOrderName) throw new Error(order.error || 'Missing ERP Sales Order receipt')
    return tx.immediErpSync.update({ where: { id: row.id }, data: { status: 'SYNCED', reference: order.erpOrderName, payloadHash: digest(source.payload), lastError: null, attempts: 0 } })
  })
}

export async function syncBrandAssignment(brandId: string, cfg: ImmediErpConfig) {
  // Obtain a Sales Order first. A new assignment on an existing brand also needs
  // the real current subscription represented in ERP, using its stable identity.
  const sub = await prisma.brandSubscription.findFirst({ where: { brandId, status: 'ACTIVE', feeWaived: false, totalDueUsd: { gt: 0 } }, orderBy: { createdAt: 'desc' } })
  if (sub) await syncSubscription(sub.id, cfg)
  return withReceipt('BRAND', brandId, async (tx, row) => {
    const brand = await tx.brand.findUnique({ where: { id: brandId }, include: { crew: { include: { members: { include: { user: true } } } } } })
    if (!brand) throw new Error('Brand no longer exists; review ERP assignment closure')
    const principals = (brand.crew?.members || []).filter((member: any) => member.active && member.role === 'PRINCIPAL' && member.user.type === 'HUMAN' && member.user.status === 'ACTIVE')
    const ids = principals.map((member: any) => {
      const id = cfg.employeeMap?.[member.userId] || cfg.employeeMap?.[member.user.email.toLowerCase()]
      if (!id) throw new Error(`Missing ERP employee mapping for AMC user ${member.userId}`)
      return id
    }).sort()
    const order = sub ? await tx.immediErpSync.findUnique({ where: { id: `SUBSCRIPTION:${sub.id}` } }) : null
    // Once a brand was synchronized, preserve its Sales Order reference for a
    // cancellation/last-principal removal, even without an active subscription.
    const prior = row.reference ? JSON.parse(row.reference) : null
    const orderName = order?.reference || prior?.salesOrder
    const serviceType = ({ essential: 'AMC-Essential', booster: 'AMC-Booster', starter: 'AMC-Starter' } as Record<string, string>)[sub?.planId] || prior?.serviceType
    if (!orderName || !serviceType) throw new Error('Assignment is waiting for its ERP order and supported subscription plan')
    const input = { brand_id: brandId, brand_name: brand.name, principal_employee_ids: ids, service_type: serviceType, sales_order_name: orderName, active: brand.status === 'ACTIVE' && sub?.status === 'ACTIVE' }
    const hash = digest(input)
    if (row.status === 'SYNCED' && row.payloadHash === hash) return row
    const revision = row.payloadHash === hash ? row.revision : row.revision + 1
    await tx.immediErpSync.update({ where: { id: row.id }, data: { payloadHash: hash, revision } })
    const response = await erpPost<Record<string, any>>({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, path: '/brand-assignments', body: { ...input, revision } }, 0)
    if (response.status < 200 || response.status >= 300 || !response.data.result?.project?.name || response.data.result?.stale) {
      throw new Error(`ERP assignment sync ${response.status}: ${JSON.stringify(response.data)}`)
    }
    return tx.immediErpSync.update({ where: { id: row.id }, data: { status: 'SYNCED', lastError: null, attempts: 0, reference: JSON.stringify({ project: response.data.result.project.name, salesOrder: orderName, serviceType }) } })
  })
}

export async function processImmediErpSync() {
  const cfg = await getImmediErpConfig()
  if (!cfg) return
  const rollout = await prisma.immediErpSync.findUnique({ where: { id: 'rollout' } })
  if (!rollout) throw new Error('Immedi ERP migration/cutover marker is missing')
  let cursor: string | undefined
  do {
    const rows = await prisma.brandSubscription.findMany({ where: { status: 'ACTIVE', feeWaived: false, totalDueUsd: { gt: 0 } }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    for (const row of rows) await syncSubscription(row.id, cfg)
    cursor = rows.length === 100 ? rows[99].id : undefined
  } while (cursor)
  cursor = undefined
  do {
    const orders: Array<{id: string}> = await prisma.immediServiceOrder.findMany({ orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    for (const order of orders) await syncServiceOrder(order.id, cfg)
    cursor = orders.length === 100 ? orders[99].id : undefined
  } while (cursor)
  const tracked = await prisma.immediErpSync.findMany({ where: { kind: 'BRAND' }, select: { sourceId: true } })
  cursor = undefined
  do {
    const brands: Array<{ id: string }> = await prisma.brand.findMany({ where: { OR: [{ id: { in: tracked.map((row: any) => row.sourceId) } }, { subscriptions: { some: { status: 'ACTIVE', feeWaived: false, totalDueUsd: { gt: 0 } } } }] }, select: { id: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    for (const brand of brands) await syncBrandAssignment(brand.id, cfg)
    cursor = brands.length === 100 ? brands[99].id : undefined
  } while (cursor)
}

export function startImmediErpWorker() {
  if (globalState.immediErpTimer) return
  const tick = async () => {
    if (globalState.immediErpRunning) return
    globalState.immediErpRunning = true
    try { await processImmediErpSync() } catch (error) { console.error('[Immedi ERP worker]', error instanceof Error ? error.message : 'Failed') }
    finally { globalState.immediErpRunning = false }
  }
  globalState.immediErpTimer = setInterval(() => void tick(), 60_000)
  globalState.immediErpTimer.unref()
  void tick()
}
