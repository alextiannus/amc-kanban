import crypto from 'node:crypto'
import { MONTHLY_SERVICE_ADDONS } from '../subscription/catalog'
import type { ImmediErpConfig } from './immediErp'
export const hashOrder = (input: unknown) => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
export function isPaidSubscription(sub: any) {
  return sub.status === 'ACTIVE' && !sub.feeWaived && sub.totalDueUsd > 0
}
export function resolvePrincipal(brand: any, cfg: ImmediErpConfig) {
  const members = (brand.crew?.members || []).filter((m: any) => m.active && m.role === 'PRINCIPAL' && m.user.type === 'HUMAN' && m.user.status === 'ACTIVE')
  if (members.length !== 1) throw new Error('品牌需有一位明确的有效主理人，才能默认记录销售归属')
  const user = members[0].user
  const employee = cfg.employeeMap?.[user.id] || cfg.employeeMap?.[user.email.toLowerCase()]
  if (!employee) throw new Error('品牌主理人尚未完成 ERP 员工映射')
  return employee
}
export const brandInclude = { crew: { include: { members: { include: { user: true } } } } }
export function orderCustomer(brand: any, customer = brand.owner) {
  if (!customer?.email && !brand.phone) throw new Error('品牌缺少真实客户邮箱或电话')
  return { contact_name: customer?.nickname || brand.name, company_name: brand.name, mobile_no: brand.phone || null, email: customer?.email || null }
}
// Existing ERP service catalog: these services remain separate from plan add-on visibility.
export function serviceCatalog(cfg: ImmediErpConfig) {
  return MONTHLY_SERVICE_ADDONS.filter(a => cfg.itemCodeMap[a.id]).map(a => ({ id: a.id, name: a.name, pricing: a.pricing, price: a.usd, currency: 'SGD' }))
}
export function buildServicePurchase(body: any, cfg: ImmediErpConfig) {
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw new Error('请选择 1–30 项服务')
  const seen = new Set<string>()
  const items = body.items.map((line: any) => {
    const service = serviceCatalog(cfg).find(s => s.id === line.serviceId)
    if (!service || seen.has(service.id)) throw new Error('服务不存在或重复')
    seen.add(service.id)
    const quantity = Number(line.quantity), months = service.pricing === 'monthly' ? Number(line.months) : 1
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isSafeInteger(months) || months < 1 || months > 36) throw new Error('数量须为 1–100，月数须为 1–36')
    return { item_code: cfg.itemCodeMap[service.id], quantity: quantity * months, rate: service.price, amount: service.price * quantity * months, cost_center: cfg.costCenter || 'Main - IMD' }
  })
  const delivery = String(body.deliveryDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(delivery) || !Number.isFinite(Date.parse(delivery)) || new Date(delivery).toISOString().slice(0,10)!==delivery) throw new Error('请填写有效交付日期')
  const sales = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date())
  if (delivery < sales) throw new Error('交付日期不能早于下单日期')
  return { items, amount: items.reduce((sum: number, item: any) => sum + item.amount, 0), currency: 'SGD', sales_date: sales, delivery_date: delivery }
}
