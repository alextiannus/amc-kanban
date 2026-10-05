import { createErpLead, type ImmediErpConfig } from '../src/lib/integrations/immediErp.ts'

const cfg: ImmediErpConfig = {
  apiKey: 'test-key',
  baseUrl: 'https://erp.example/external/v1',
  itemCodeMap: { bd_lead: 'AMC-STARTER' },
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function run() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'))
      assert(body.item_code === 'AMC-STARTER', 'lead item code should be sent')
      assert(body.business_unit === 'AMC BU', 'AMC BU should be the default business unit')
      return new Response(JSON.stringify({ ok: true, result: { lead: { name: 'CRM-LEAD-0001' } } }), { status: 201 })
    }
    const created = await createErpLead(cfg, {
      item_code: 'AMC-STARTER',
      lead_name: 'Test Merchant',
      company_name: 'Test Merchant',
    })
    assert(created.ok && created.erpLeadName === 'CRM-LEAD-0001', 'successful response should return ERP Lead ID')

    globalThis.fetch = async () => new Response(JSON.stringify({
      error: 'Duplicate Lead creation prevented. A matching record was created recently: CRM-LEAD-0001',
    }), { status: 409 })
    const duplicate = await createErpLead(cfg, {
      item_code: 'AMC-STARTER',
      lead_name: 'Test Merchant',
      company_name: 'Test Merchant',
    })
    assert(duplicate.ok && duplicate.alreadyExists, 'safe ERP duplicate should be recovered as success')
    assert(duplicate.erpLeadName === 'CRM-LEAD-0001', 'safe ERP duplicate should recover Lead ID')

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid item code for Bearer imx_secret-value' }), { status: 400 })
    const failed = await createErpLead(cfg, {
      item_code: 'UNKNOWN',
      lead_name: 'Test Merchant',
      company_name: 'Test Merchant',
    })
    assert(!failed.ok && failed.status === 400, 'business validation errors should remain failures')
    assert(!failed.error?.includes('secret-value'), 'persisted ERP errors must redact API keys')

    console.log('[bd-lead-erp-sync-test] all tests passed')
  } finally {
    globalThis.fetch = originalFetch
  }
}

await run()
