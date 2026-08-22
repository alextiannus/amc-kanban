import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getImmediErpConfig, createSalesOrder, createErpTask } from '@/lib/integrations/immediErp'

/**
 * POST /api/admin/integrations/immedi-erp/test
 * Tests connectivity to the Immedi Today ERP API.
 * Admin-only.
 */
export async function POST() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cfg = await getImmediErpConfig()
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'ERP integration is disabled or API key is not configured in System Config.' },
      { status: 400 }
    )
  }

  const results: Record<string, unknown> = {}

  // Test 1: Create a test Sales Order
  try {
    const today = new Date().toISOString().slice(0, 10)
    const orderResult = await createSalesOrder(cfg, {
      idempotencyKey: `amc-test-${Date.now()}`,
      contact_name:   'AMC System Test',
      company_name:   'AMC Admin Test Brand',
      mobile_no:      '+65 0000 0000',
      items:          [{ item_code: 'AMC-STARTER', quantity: 1, rate: 100, amount: 100 }],
      amount:         100,
      currency:       'SGD',
      sales_date:     today,
    })
    results.salesOrder = {
      ok:           orderResult.ok,
      erpOrderName: orderResult.erpOrderName,
      alreadyExists: orderResult.alreadyExists,
      error:        orderResult.error,
    }
  } catch (err) {
    results.salesOrder = { ok: false, error: String(err) }
  }

  // Test 2: Create a test Task
  try {
    const taskResult = await createErpTask(cfg, {
      subject:      '[AMC] 系统连通性测试任务 — 请忽略',
      description:  '由 amc-kanban 管理员在 Admin 控制台发起的连通性测试，可安全关闭。',
      priority:     'Low',
      exp_end_date: `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)} 18:00:00`,
    })
    results.task = {
      ok:          taskResult.ok,
      erpTaskName: taskResult.erpTaskName,
      error:       taskResult.error,
    }
  } catch (err) {
    results.task = { ok: false, error: String(err) }
  }

  const allOk = Object.values(results).every((r) => (r as { ok: boolean }).ok)

  return NextResponse.json({
    ok: allOk,
    baseUrl: cfg.baseUrl,
    results,
  }, { status: allOk ? 200 : 207 })
}
