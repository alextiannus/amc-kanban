import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { authenticateRequest, canAccessBrand } from '@/lib/auth-v2'
import { prisma } from '@/lib/prisma'
import { getImmediErpConfig } from '@/lib/integrations/immediErp'
import { brandInclude, buildServicePurchase, hashOrder, orderCustomer, resolvePrincipal, serviceCatalog } from '@/lib/integrations/immediOrders'
type Params = { params: Promise<{ id: string }> }
async function access(request: Request, id: string) {
 const principal = await authenticateRequest(request)
 if (!principal) return { error: NextResponse.json({ error: '请先登录' }, { status: 401 }) }
 if (!await canAccessBrand(principal, id, 'subscription.manage')) return { error: NextResponse.json({ error: '无此品牌的订阅管理权限' }, { status: 403 }) }
 return { principal }
}
export async function GET(request: Request, { params }: Params) {
 const { id } = await params, auth = await access(request, id)
 if (auth.error) return auth.error
 const cfg = await getImmediErpConfig()
 const orders = await prisma.immediServiceOrder.findMany({ where: { brandId: id }, orderBy: { createdAt: 'desc' }, take: 100 })
 const subscriptions = await prisma.brandSubscription.findMany({ where: { brandId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, planName: true, status: true, paidAt: true, feeWaived: true, totalDueUsd: true } })
 const receipts = await prisma.immediErpSync.findMany({ where: { OR: [{ kind: 'ORDER', sourceId: { in: orders.map((o: any) => o.id) } }, { kind: 'SUBSCRIPTION', sourceId: { in: subscriptions.map((s: any) => s.id) } }, { kind: 'BRAND', sourceId: id }] } })
 const status = (kind: string, sourceId: string) => {
  const row = receipts.find((r: any) => r.kind === kind && r.sourceId === sourceId)
  return { status: row?.status || 'PENDING', erpReference: row?.reference || null, error: row?.lastError || null, updatedAt: row?.updatedAt || null }
 }
 return NextResponse.json({ enabled: !!cfg, catalog: cfg ? serviceCatalog(cfg) : [], orders: orders.map((o: any) => ({ id: o.id, createdAt: o.createdAt, amount: (o.payload as any).amount, currency: (o.payload as any).currency, ...status('ORDER',o.id) })), subscriptions: subscriptions.map((s: any) => ({ ...s, ...status('SUBSCRIPTION',s.id), eligible: s.status === 'ACTIVE' && !s.feeWaived && s.totalDueUsd > 0 })), assignment: status('BRAND',id) })
}
export async function POST(request: Request, { params }: Params) {
 const { id } = await params, auth = await access(request, id)
 if (auth.error) return auth.error
 if (auth.principal?.source === 'session' && !allowedRoleWriteOrigin(request)) return NextResponse.json({error:'Invalid request origin'},{status:403})
 try {
  const body = await request.json()
  const requestId = String(request.headers.get('idempotency-key') || '')
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) return NextResponse.json({ error: '缺少有效订单请求标识' }, { status: 400 })
  const requestKey = hashOrder([id, auth.principal!.userId, requestId]), requestHash = hashOrder(body)
  const existing = await prisma.immediServiceOrder.findUnique({ where: { requestKey } })
  if (existing) return existing.requestHash === requestHash ? NextResponse.json({ id: existing.id, status: 'QUEUED' }) : NextResponse.json({ error: '同一请求标识已用于不同订单' }, { status: 409 })
  const cfg = await getImmediErpConfig()
  if (!cfg) return NextResponse.json({ error: 'ERP 对接尚未配置，暂不能提交订单' }, { status: 503 })
  const brand = await prisma.brand.findUnique({ where: { id }, include: brandInclude })
  if (!brand || brand.status !== 'ACTIVE') return NextResponse.json({ error: '品牌不存在或未启用' }, { status: 404 })
  const customer = brand.ownerId ? await prisma.user.findUnique({where:{id:brand.ownerId},select:{email:true,nickname:true}}) : null
  const orderId = crypto.randomUUID()
  const payload = { ...buildServicePurchase(body, cfg), ...orderCustomer(brand,customer), principal_employee_id: resolvePrincipal(brand,cfg), idempotencyKey: 'amc-order-' + orderId, amc_source: { kind: 'service_order', id: orderId, brand_id: id } }
  try {
   await prisma.$transaction(async (tx: any) => {
    await tx.immediServiceOrder.create({ data: { id: orderId, brandId: id, createdById: auth.principal!.userId, requestKey, requestHash, payload } })
    await tx.immediErpSync.create({ data: { id: 'ORDER:' + orderId, kind: 'ORDER', sourceId: orderId } })
   })
  } catch (error) {
   const found = await prisma.immediServiceOrder.findUnique({ where: { requestKey } })
   if (found?.requestHash === requestHash) return NextResponse.json({ id: found.id, status: 'QUEUED' })
   if (found) return NextResponse.json({ error: '同一请求标识已用于不同订单' }, { status: 409 })
   throw error
  }
  return NextResponse.json({ id: orderId, status: 'QUEUED' }, { status: 202 })
 } catch (error) {
  const internal = String((error as any)?.name || '').includes('Prisma')
  return NextResponse.json({ error: internal ? '订单暂时无法保存，请重试原订单' : error instanceof Error ? error.message : '订单提交失败' }, { status: internal ? 503 : 400 })
 }
}
