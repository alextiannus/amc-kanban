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
  // Subscription plans
  starter:           'AMC-STARTER',
  essential:         'AMC-ESSENTIAL',
  booster:           'AMC-BOOSTER',
  // Add-ons
  multi_store:       'AMC-MULTI-STORE-MONTHLY',
  xiaohongshu_ops: 'AMC-XIAOHONGSHU-MONTHLY',
  meituan_dianping_setup: 'AMC-MEITUAN-DIANPING-ANNUAL',
  meituan_dianping_ops: 'AMC-MEITUAN-DIANPING-OPS-MONTHLY',
  twelveeat_delivery_setup: 'AMC-12EAT-LAUNCH',
  twelveeat_delivery_ops: 'AMC-12EAT-OPS-MONTHLY',
  grab_foodpanda_ops: 'AMC-GRAB-FOODPANDA-OPS-MONTHLY',
  youtube_ops: 'AMC-YOUTUBE-MONTHLY',
  short_video_six: 'AMC-SHORT-VIDEO-6',
  onsite_photo:      'AMC-ON-SITE-SHOOT',
  kol_light:         'AMC-ADDON-KOL-LIGHT',
  influencer_visit:  'AMC-INFLUENCER-VISIT-12',
  dianping_ops:      'AMC-ADDON-DIANPING',
  ordering_site:     'AMC-ADDON-ORDERING',
}

// ── Config ─────────────────────────────────────────────────────────────────

export interface ImmediErpConfig {
  apiKey: string
  baseUrl: string
  employeeMap?: Record<string, string>
  costCenter?: string
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
      employeeMap: (config.immediErpEmployeeMap || {}) as Record<string, string>,
      costCenter: config.immediErpCostCenter || 'Main - IMD',
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
  cost_center?: string
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

// ── HTTP helpers ───────────────────────────────────────────────────────────

interface FetchOptions {
  baseUrl:          string
  apiKey:           string
  path:             string
  body:             Record<string, unknown>
  idempotencyKey?:  string
}

export async function erpPost<T>(
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
      const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(opts.body), signal: AbortSignal.timeout(45_000), redirect: 'error' })
      const text = await res.text()
      let data: T
      try { data = JSON.parse(text) as T } catch { data = { raw: text } as unknown as T }

      // Conflicts are returned to the caller and never treated as success.
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
          ...(params.mobile_no ? { mobile_no: params.mobile_no } : {}),
          ...(params.email     ? { email_id:  params.email     } : {}),
          items:         params.items.map(item => ({ ...item, cost_center: item.cost_center || cfg.costCenter || 'Main - IMD' })),
          business_unit: DEFAULT_BUSINESS_UNIT,
          amount:        params.amount,
          currency:      params.currency || 'SGD',
          sales_date:    params.sales_date,
          ...(params.delivery_date ? { delivery_date: params.delivery_date } : {}),
          // Required by Immedi Today ERP
          taxes_and_charges: params.taxes_and_charges || DEFAULT_TAXES,
        },
      }
    )

    if (status === 201 || status === 200) {
      const result = data.result as Record<string, unknown> | undefined
      const order = result?.salesOrder as Record<string, unknown> | undefined
      if (typeof order?.name === 'string' && order.name) return { ok: true, erpOrderName: order.name }
      return { ok: false, error: 'ERP response did not contain a verified Sales Order reference', status }
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

export { buildOrderItems } from './immediErpContract'

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
 * Compatibility entry point for durable subscription synchronization.
 *
 * The worker persists failures and retries without relying on this call.
 */
export async function triggerErpOnboardingFlow(input: ErpOnboardingInput): Promise<void> {
  // The persisted subscription is the durable source. The minute worker recovers
  // failed/interrupted calls and covers every creation path, including renewals.
  const { syncSubscription } = await import('./immediErpWorker')
  await syncSubscription(input.subscription.id)
}
