/**
 * Immedi Today ERP Integration (ERPNext External API)
 *
 * Endpoints:
 *   POST {baseUrl}/sales-orders  — 创建草稿销售订单
 *   POST {baseUrl}/tasks         — 创建任务（财务收款确认 / 跟进）
 *
 * Auth:        Bearer token from SystemConfig.immediErpApiKey
 * Idempotency: Idempotency-Key header = "amc-sub-{subscriptionId}"
 * Retry:       Exponential backoff on 5xx/network errors, max 3 retries
 * BU:          All tasks use business_unit = "AMC BU" for auto-assignment
 */

import { ensureSystemConfig } from '@/lib/systemConfig'

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://today.immedi.ai/external/v1'
const DEFAULT_BUSINESS_UNIT = 'AMC BU'
const DEFAULT_TAXES = 'Singapore GST 9% - IMD'

/**
 * Default ERP item_code mapping.
 * Keys match subscription planId / addonId in catalog.ts.
 * Admins can override via SystemConfig.immediErpItemCodeMap (JSON).
 */
const DEFAULT_ITEM_CODE_MAP: Record<string, string> = {
  // Generic BD lead product interest
  bd_lead:           'AMC-STARTER',
  // Subscription plans
  starter:           'AMC-STARTER',
  essential:         'AMC-ESSENTIAL',
  advanced:          'AMC-ADVANCED',
  // Add-ons
  multi_store:       'AMC-ADDON-MULTISTORE',
  onsite_photo:      'AMC-ADDON-PHOTO',
  kol_light:         'AMC-ADDON-KOL-LIGHT',
  influencer_visit:  'AMC-ADDON-KOL-PRO',
  dianping_ops:      'AMC-ADDON-DIANPING',
  ordering_site:     'AMC-ADDON-ORDERING',
}

// ── Config ─────────────────────────────────────────────────────────────────

export interface ImmediErpConfig {
  apiKey: string
  baseUrl: string
  itemCodeMap: Record<string, string>
}

/**
 * Load Immedi ERP config from SystemConfig.
 * Returns null if ERP integration is disabled or API key is not set.
 */
export async function getImmediErpConfig(): Promise<ImmediErpConfig | null> {
  try {
    const config = await ensureSystemConfig()
    if (!config.immediErpEnabled) return null
    if (!config.immediErpApiKey) return null
    const overrideMap =
      config.immediErpItemCodeMap &&
      typeof config.immediErpItemCodeMap === 'object' &&
      !Array.isArray(config.immediErpItemCodeMap)
        ? (config.immediErpItemCodeMap as Record<string, string>)
        : {}
    return {
      apiKey: config.immediErpApiKey,
      baseUrl: (config.immediErpBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''),
      itemCodeMap: { ...DEFAULT_ITEM_CODE_MAP, ...overrideMap },
    }
  } catch {
    return null
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ErpOrderItem {
  item_code: string
  quantity:  number
  rate:      number
  amount:    number
}

export interface CreateSalesOrderParams {
  /** Unique business ID — used as Idempotency-Key to prevent duplicates */
  idempotencyKey:   string
  contact_name:     string
  company_name:     string
  mobile_no?:       string | null
  email?:           string | null
  items:            ErpOrderItem[]
  amount:           number
  currency?:        string
  sales_date:       string   // YYYY-MM-DD
  delivery_date?:   string   // YYYY-MM-DD
  /** ERP taxes template — required. Defaults to 'Singapore GST 9% - IMD' */
  taxes_and_charges?: string
}

export interface ErpSalesOrderResult {
  ok:             boolean
  erpOrderName?:  string   // e.g. "SAL-ORD-2026-00030"
  alreadyExists?: boolean  // 409 — idempotent duplicate
  error?:         string
  status?:        number
}

export interface CreateTaskParams {
  subject:        string
  description?:   string
  priority?:      'Low' | 'Medium' | 'High'
  exp_end_date?:  string  // YYYY-MM-DD HH:MM:SS
  business_unit?: string  // defaults to "AMC BU"
  assigned_to?:   string  // ERP user email (overrides auto-assignment)
}

export interface ErpTaskResult {
  ok:           boolean
  erpTaskName?: string   // e.g. "TASK-2026-00982"
  error?:       string
  status?:      number
}

export interface CreateLeadParams {
  item_code:     string
  lead_name:     string
  company_name:  string
  mobile_no?:    string | null
  email_id?:     string | null
  source?:       string
  remarks?:      string
  business_unit?: string
}

export interface ErpLeadResult {
  ok:             boolean
  erpLeadName?:   string
  alreadyExists?: boolean
  error?:         string
  status?:        number
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

interface FetchOptions {
  baseUrl:          string
  apiKey:           string
  path:             string
  body:             Record<string, unknown>
  idempotencyKey?:  string
}

async function erpPost<T>(
  opts:       FetchOptions,
  retries   = 3,
  delayMs   = 800
): Promise<{ status: number; data: T }> {
  const url     = `${opts.baseUrl}${opts.path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
    'X-Request-Id': `amc-kanban-${Date.now()}`,
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(opts.body) })
      const text = await res.text()
      let data: T
      try { data = JSON.parse(text) as T } catch { data = { raw: text } as unknown as T }

      // 409 = idempotent duplicate — not an error
      if (res.status === 409) return { status: 409, data }

      // 5xx → retry with exponential backoff
      if (res.status >= 500 && attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt)
        console.warn(`[immediErp] POST ${opts.path} got ${res.status}, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }

      return { status: res.status, data }
    } catch (networkErr) {
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt)
        console.warn(`[immediErp] Network error on POST ${opts.path}, retrying in ${wait}ms:`, networkErr)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      throw networkErr
    }
  }
  throw new Error('[immediErp] Exhausted retries')
}

// ── Lead ──────────────────────────────────────────────────────────────────

export async function createErpLead(
  cfg: ImmediErpConfig,
  params: CreateLeadParams
): Promise<ErpLeadResult> {
  try {
    const { status, data } = await erpPost<Record<string, unknown>>({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      path: '/leads',
      body: {
        item_code: params.item_code,
        lead_name: params.lead_name,
        company_name: params.company_name,
        ...(params.mobile_no ? { mobile_no: params.mobile_no } : {}),
        ...(params.email_id ? { email_id: params.email_id } : {}),
        source: params.source || 'AMC-MM BD',
        ...(params.remarks ? { remarks: params.remarks } : {}),
        business_unit: params.business_unit || DEFAULT_BUSINESS_UNIT,
      },
    })

    const result = data?.result as Record<string, unknown> | undefined
    const lead = result?.lead as Record<string, unknown> | undefined
    const erpLeadName = lead?.name as string | undefined
    if ((status === 200 || status === 201) && erpLeadName) {
      return { ok: true, erpLeadName }
    }

    // The ERP duplicate guard includes the existing Lead ID in its safe 409
    // message. This recovers a retry when the first response was lost.
    if (status === 409) {
      const message = String(data?.error || '')
      const existingName = message.match(/created recently:\s*([^\s]+)/i)?.[1]
      if (existingName) {
        return { ok: true, erpLeadName: existingName, alreadyExists: true }
      }
    }

    return { ok: false, error: safeErpError(data), status }
  } catch (err) {
    return { ok: false, error: safeErpError(err) }
  }
}

function safeErpError(value: unknown): string {
  let message: string
  if (value && typeof value === 'object' && 'error' in value) {
    message = String((value as { error?: unknown }).error || 'ERP request failed')
  } else {
    message = String(value instanceof Error ? value.message : value || 'ERP request failed')
  }
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/imx_[A-Za-z0-9_-]+/g, 'imx_[REDACTED]')
    .slice(0, 500)
}

// ── Sales Order ────────────────────────────────────────────────────────────

export async function createSalesOrder(
  cfg:    ImmediErpConfig,
  params: CreateSalesOrderParams
): Promise<ErpSalesOrderResult> {
  try {
    const { status, data } = await erpPost<Record<string, unknown>>(
      {
        baseUrl:        cfg.baseUrl,
        apiKey:         cfg.apiKey,
        path:           '/sales-orders',
        idempotencyKey: params.idempotencyKey,
        body: {
          contact_name:  params.contact_name,
          company_name:  params.company_name,
          // ERP requires at least mobile_no or email to create/link a CRM Lead
          ...(params.mobile_no ? { mobile_no: params.mobile_no } : { mobile_no: '+65 0000 0000' }),
          ...(params.email     ? { email:     params.email     } : {}),
          items:         params.items,
          amount:        params.amount,
          currency:      params.currency || 'SGD',
          sales_date:    params.sales_date,
          ...(params.delivery_date ? { delivery_date: params.delivery_date } : {}),
          // Required by Immedi Today ERP
          taxes_and_charges: params.taxes_and_charges || DEFAULT_TAXES,
        },
      }
    )

    if (status === 409) {
      const existing = (data as Record<string, unknown>)?.data as Record<string, unknown> | undefined
      return { ok: true, erpOrderName: existing?.name as string | undefined, alreadyExists: true }
    }

    if (status === 201 || status === 200) {
      const d    = data as Record<string, unknown>
      const name = ((d?.data as Record<string, unknown>)?.salesOrder as Record<string, unknown>)?.name
        ?? (d?.name as string | undefined)
      return { ok: true, erpOrderName: name as string | undefined }
    }

    console.error(`[immediErp] Sales Order creation failed: status=${status}`, data)
    return { ok: false, error: JSON.stringify(data), status }
  } catch (err) {
    console.error('[immediErp] createSalesOrder error:', err)
    return { ok: false, error: String(err) }
  }
}

// ── Task ───────────────────────────────────────────────────────────────────

export async function createErpTask(
  cfg:    ImmediErpConfig,
  params: CreateTaskParams
): Promise<ErpTaskResult> {
  try {
    const { status, data } = await erpPost<Record<string, unknown>>(
      {
        baseUrl: cfg.baseUrl,
        apiKey:  cfg.apiKey,
        path:    '/tasks',
        body: {
          subject:       params.subject,
          ...(params.description   ? { description:   params.description   } : {}),
          priority:      params.priority      || 'High',
          business_unit: params.business_unit || DEFAULT_BUSINESS_UNIT,
          ...(params.exp_end_date  ? { exp_end_date:  params.exp_end_date  } : {}),
          ...(params.assigned_to   ? { assigned_to:   params.assigned_to   } : {}),
        },
      }
    )

    if (status === 201 || status === 200) {
      const d    = data as Record<string, unknown>
      const task = (d?.result as Record<string, unknown>)?.task as Record<string, unknown> | undefined
      const name = (task?.id ?? d?.name ?? d?.id) as string | undefined
      return { ok: true, erpTaskName: name }
    }

    console.error(`[immediErp] Task creation failed: status=${status}`, data)
    return { ok: false, error: JSON.stringify(data), status }
  } catch (err) {
    console.error('[immediErp] createErpTask error:', err)
    return { ok: false, error: String(err) }
  }
}

// ── Item Code Mapping ──────────────────────────────────────────────────────

interface SelectedAddon {
  id:       string
  name:     string
  pricing:  'monthly' | 'one_time'
  usd:      number
  quantity?: number
}

export interface SubscriptionSummary {
  id:             string
  planId:         string
  planName:       string
  totalDueUsd:    number
  durationMonths: number
  selectedAddons?: unknown
}

export function buildOrderItems(
  sub: SubscriptionSummary,
  cfg: ImmediErpConfig
): ErpOrderItem[] {
  const items: ErpOrderItem[] = []
  const map = cfg.itemCodeMap

  // Parse addons
  const addons: SelectedAddon[] = []
  if (Array.isArray(sub.selectedAddons)) {
    for (const a of sub.selectedAddons) {
      if (a && typeof a === 'object' && typeof (a as Record<string, unknown>).id === 'string') {
        addons.push(a as SelectedAddon)
      }
    }
  }

  // Plan base total
  const oneTimeTotal      = addons.filter((a) => a.pricing === 'one_time').reduce((s, a) => s + a.usd * (a.quantity ?? 1), 0)
  const monthlyAddonsTotal = addons.filter((a) => a.pricing === 'monthly').reduce((s, a) => s + a.usd * (a.quantity ?? 1), 0)
  const planBaseMonthly   = (sub.totalDueUsd - oneTimeTotal - monthlyAddonsTotal * sub.durationMonths) / sub.durationMonths
  const planBaseTotal     = Math.round(planBaseMonthly * sub.durationMonths)

  const planCode = map[sub.planId] || `AMC-${sub.planId.toUpperCase()}`
  if (planBaseTotal > 0) {
    items.push({
      item_code: planCode,
      quantity:  sub.durationMonths,
      rate:      Math.round(planBaseMonthly),
      amount:    planBaseTotal,
    })
  }

  // Addon items
  for (const addon of addons) {
    const addonCode = map[addon.id] || `AMC-ADDON-${addon.id.toUpperCase().replace(/_/g, '-')}`
    const qty = addon.quantity ?? 1
    if (addon.pricing === 'one_time') {
      items.push({ item_code: addonCode, quantity: qty, rate: addon.usd, amount: addon.usd * qty })
    } else {
      const total = addon.usd * qty * sub.durationMonths
      items.push({ item_code: addonCode, quantity: sub.durationMonths, rate: addon.usd * qty, amount: total })
    }
  }

  return items
}

// ── Orchestrator ───────────────────────────────────────────────────────────

export interface ErpOnboardingInput {
  subscription:     SubscriptionSummary
  brandName:        string
  contactName?:     string | null
  companyName?:     string | null
  mobileNo?:        string | null
  salespersonName?:  string | null
  salespersonEmail?: string | null
  trialEndsAt?:     Date | null
}

/**
 * Full onboarding flow triggered after subscription activation (fire-and-forget).
 * 1. Create draft Sales Order in ERP
 * 2. Create Finance Collection Confirmation Task (due 3 days, High)
 * 3. Create Client Follow-up Task (due 7 days, Medium)
 * 4. Create Sales Payment Follow-up Task for salesperson (due = trial end, High)
 *
 * Never throws — call with .catch(console.error).
 */
export async function triggerErpOnboardingFlow(input: ErpOnboardingInput): Promise<void> {
  const { subscription, brandName } = input
  const salesperson = input.salespersonName || input.salespersonEmail || null

  const cfg = await getImmediErpConfig()
  if (!cfg) return  // ERP disabled or not configured — silently skip

  const today        = new Date()
  const salesDate    = today.toISOString().slice(0, 10)
  const deliveryDate = new Date(today)
  deliveryDate.setMonth(deliveryDate.getMonth() + subscription.durationMonths)
  const deliveryDateStr = deliveryDate.toISOString().slice(0, 10)

  const items = buildOrderItems(subscription, cfg)

  console.log(`[immediErp] Triggering onboarding for sub=${subscription.id}, brand=${brandName}, salesperson=${salesperson ?? 'none'}`)

  // ── Step 1: Sales Order ────────────────────────────────────────────────
  const orderResult = await createSalesOrder(cfg, {
    idempotencyKey: `amc-sub-${subscription.id}`,
    contact_name:   input.contactName || brandName,
    company_name:   input.companyName || brandName,
    mobile_no:      input.mobileNo || null,
    items,
    amount:         subscription.totalDueUsd,
    currency:       'SGD',
    sales_date:     salesDate,
    delivery_date:  deliveryDateStr,
  })

  const orderRef = orderResult.erpOrderName ? ` · ${orderResult.erpOrderName}` : ''
  if (!orderResult.ok && !orderResult.alreadyExists) {
    console.error(`[immediErp] Sales Order failed for sub=${subscription.id}:`, orderResult.error)
  } else {
    console.log(`[immediErp] Sales Order: ok=${orderResult.ok}, name=${orderResult.erpOrderName}, duplicate=${orderResult.alreadyExists}`)
  }

  // ── Step 2: Finance Collection Task (due 3 days) ───────────────────────
  const financeDate = new Date(today)
  financeDate.setDate(financeDate.getDate() + 3)
  const financeDateStr = `${financeDate.toISOString().slice(0, 10)} 18:00:00`

  const financeTask = await createErpTask(cfg, {
    subject:       `[AMC] 收款确认 · ${brandName} · ${subscription.planName}${orderRef}`,
    description:   `订阅 ID: ${subscription.id}\n品牌: ${brandName}\n方案: ${subscription.planName}（${subscription.durationMonths} 个月）\n金额: SGD ${subscription.totalDueUsd.toLocaleString()}\nSales Order: ${orderResult.erpOrderName || '（创建失败，请手动核查）'}${salesperson ? `\n负责销售: ${salesperson}` : ''}\n\n请在 3 个工作日内确认收款并在 ERP 中提交收款记录。`,
    priority:      'High',
    exp_end_date:  financeDateStr,
  })
  console.log(`[immediErp] Finance task: ok=${financeTask.ok}, name=${financeTask.erpTaskName}`)

  // ── Step 3: Client Follow-up Task (due 7 days) ─────────────────────────
  const followUpDate = new Date(today)
  followUpDate.setDate(followUpDate.getDate() + 7)
  const followUpDateStr = `${followUpDate.toISOString().slice(0, 10)} 10:00:00`

  const followUpTask = await createErpTask(cfg, {
    subject:      `[AMC] 客户跟进 · ${brandName} · 已开通 ${subscription.planName}`,
    description:  `客户 ${brandName} 已成功开通 ${subscription.planName} 方案（${subscription.durationMonths} 个月）。${salesperson ? `\n负责销售: ${salesperson}` : ''}\n\n请在 7 天内完成以下跟进：\n1. 确认客户已收到开通确认邮件\n2. 安排品牌入驻说明会/培训\n3. 确认 AI 团队分配情况\n4. 收集客户初始需求与资料\n\n订阅 ID: ${subscription.id}\nSales Order: ${orderResult.erpOrderName || '待核查'}`,
    priority:     'Medium',
    exp_end_date: followUpDateStr,
  })
  console.log(`[immediErp] Follow-up task: ok=${followUpTask.ok}, name=${followUpTask.erpTaskName}`)

  // ── Step 4: Sales Payment Follow-up Task (due = trial end = 5 days) ────
  // Assigned to the salesperson so they can track whether payment has been made
  // before the trial expires.
  const paymentDueDate = input.trialEndsAt ?? (() => {
    const d = new Date(today); d.setDate(d.getDate() + 5); return d
  })()
  const paymentDueDateStr = `${paymentDueDate.toISOString().slice(0, 10)} 18:00:00`

  const salesFollowUpTask = await createErpTask(cfg, {
    subject:      `[AMC] 跟进付款 · ${brandName} · 试用期结束前${salesperson ? ` · 负责: ${salesperson}` : ''}`,
    description:  `客户 ${brandName} 已进入 5 天免费试用期，请在试用期结束前（${paymentDueDate.toISOString().slice(0, 10)}）确认收款。\n\n方案: ${subscription.planName}（${subscription.durationMonths} 个月）\n金额: SGD ${subscription.totalDueUsd.toLocaleString()}\n${salesperson ? `负责销售: ${salesperson}` : ''}${input.salespersonEmail ? `\n联系邮件: ${input.salespersonEmail}` : ''}\nSales Order: ${orderResult.erpOrderName || '待核查'}\n\n⚠️ 试用期届满后未收款的品牌将暂停发布权限。`,
    priority:     'High',
    exp_end_date: paymentDueDateStr,
  })
  console.log(`[immediErp] Sales payment follow-up task: ok=${salesFollowUpTask.ok}, name=${salesFollowUpTask.erpTaskName}`)
}
