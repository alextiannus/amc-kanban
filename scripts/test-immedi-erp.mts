import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOrderItems } from '../src/lib/integrations/immediErpContract.ts'
import { createSalesOrder } from '../src/lib/integrations/immediErp.ts'
const cfg = { baseUrl: 'https://today.immedi.ai/external/v1', apiKey: 'test-token', itemCodeMap: { essential: 'AMC-ESSENTIAL', photo: 'AMC-ON-SITE-SHOOT' }, costCenter: 'Main - IMD' }
const sub = { id: 'sub-1', planId: 'essential', planName: 'Essential', totalDueUsd: 1000.01, durationMonths: 3, monthlyBaseUsd: 400, selectedAddons: [{ id: 'photo', pricing: 'one_time', usd: 300, quantity: 1 }] }
test('discount allocation preserves cents and reconciles every line to its rate', () => {
  const items = buildOrderItems(sub, cfg)
  assert.equal(Math.round(items.reduce((s, i) => s + i.amount, 0) * 100), 100001)
  assert.equal(items.length, 2)
  for (const item of items) { assert.equal(item.rate * item.quantity, item.amount); assert.equal(item.cost_center, 'Main - IMD') }
})
test('missing SKU, zero contracts and malformed addons cannot fabricate an order', () => {
  assert.throws(() => buildOrderItems({ ...sub, planId: 'unknown' }, cfg), /mapping/)
  assert.throws(() => buildOrderItems({ ...sub, totalDueUsd: 0 }, cfg), /waived/)
  assert.throws(() => buildOrderItems({ ...sub, selectedAddons: [{ id: 'photo', pricing: 'monthly', usd: -5 }] }, cfg), /Invalid/)
})
test('real ERP response supplies order receipt; email field and amount stay exact', async () => {
  const original = globalThis.fetch
  let sent: any
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ ok: true, result: { salesOrder: { name: 'SO-1' } } }), { status: 201 }) }
  try {
    const result = await createSalesOrder(cfg, { idempotencyKey: 'amc-sub-1', contact_name: 'Merchant', company_name: 'Merchant Ltd', email: 'merchant@merchant.sg', items: buildOrderItems(sub, cfg), amount: 1000.01, currency: 'SGD', sales_date: '2026-09-16', delivery_date: '2026-12-16' })
    assert.equal(result.erpOrderName, 'SO-1'); assert.equal(sent.email_id, 'merchant@merchant.sg'); assert.equal(sent.mobile_no, undefined); assert.equal(sent.amount, 1000.01)
  } finally { globalThis.fetch = original }
})
test('409 and success without an order reference are failures eligible for durable retry', async () => {
  const original = globalThis.fetch
  const input = { idempotencyKey: 'amc-sub-1', contact_name: 'Merchant', company_name: 'Merchant Ltd', email: 'merchant@merchant.sg', items: [], amount: 1000, sales_date: '2026-09-16' }
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Revision conflict' }), { status: 409 })
    assert.equal((await createSalesOrder(cfg, input)).ok, false)
    globalThis.fetch = async () => new Response('{}', { status: 201 })
    assert.equal((await createSalesOrder(cfg, input)).ok, false)
  } finally { globalThis.fetch = original }
})

import { withReceipt } from '../src/lib/integrations/immediErpWorker.ts'
test('failed remote sync persists a retry deadline and survives runner reconstruction', async () => {
  let stored: any = { id: 'BRAND:b', kind: 'BRAND', sourceId: 'b', status: 'PENDING', attempts: 0 }
  let acquired = true
  const tx = { $queryRaw: async () => [{ acquired }], immediErpSync: {
    upsert: async () => ({ ...stored }),
    update: async ({ data }: any) => { stored = { ...stored, ...data, attempts: data.attempts?.increment ? stored.attempts + 1 : stored.attempts }; return stored },
  } }
  const database = { $transaction: async (execute: any) => execute(tx) }
  let attempts = 0
  await withReceipt('BRAND', 'b', async () => { attempts++; throw new Error('ERP temporarily unavailable') }, database)
  assert.equal(stored.status, 'FAILED'); assert.equal(stored.attempts, 1); assert.match(stored.lastError, /unavailable/)
  await withReceipt('BRAND', 'b', async () => { attempts++ }, database)
  assert.equal(attempts, 1)
  stored.nextAttemptAt = new Date(0)
  acquired = false
  await withReceipt('BRAND', 'b', async () => { attempts++ }, database)
  assert.equal(attempts, 1)
  acquired = true
  await withReceipt('BRAND', 'b', async (client, row) => { attempts++; return client.immediErpSync.update({ data: { status: 'SYNCED', reference: 'PROJ-1', lastError: null } }) }, database)
  assert.equal(attempts, 2); assert.equal(stored.reference, 'PROJ-1'); assert.equal(stored.lastError, null)
})

import { isPaidSubscription, resolvePrincipal, buildServicePurchase } from '../src/lib/integrations/immediOrders.ts'
test('ACTIVE chargeable subscription is accepted as paid without a second confirmation', () => {
 const sub={status:'ACTIVE',paidAt:new Date(),feeWaived:false,totalDueUsd:100}
 assert.ok(isPaidSubscription(sub));assert.ok(isPaidSubscription({...sub,paidAt:null}));assert.ok(!isPaidSubscription({...sub,feeWaived:true}));assert.ok(!isPaidSubscription({...sub,totalDueUsd:0}));assert.ok(!isPaidSubscription({...sub,status:'CANCELLED'}))
})
test('default salesperson is exact active HUMAN principal; owner, manager and ambiguous crews are rejected', () => {
 const member={active:true,role:'PRINCIPAL',user:{id:'u1',email:'principal@example.com',type:'HUMAN',status:'ACTIVE'}}
 const cfg2={...cfg,employeeMap:{u1:'erp-principal'}}
 assert.equal(resolvePrincipal({crew:{members:[member]}},cfg2),'erp-principal')
 assert.throws(()=>resolvePrincipal({crew:{members:[member,member]}},cfg2),/一位/)
 assert.throws(()=>resolvePrincipal({crew:{members:[{...member,role:'OWNER'}]}},cfg2),/一位/)
 assert.throws(()=>resolvePrincipal({crew:{members:[member]}},cfg),/映射/)
})
test('standalone add-on order uses server catalog and exact quantity/months; browser cannot set price or currency', () => {
 const config={...cfg,itemCodeMap:{xiaohongshu_ops:'AMC-XIAOHONGSHU-MONTHLY',onsite_photo:'AMC-ON-SITE-SHOOT'}}
 const input={deliveryDate:'2099-12-01',amount:1,currency:'USD',items:[{serviceId:'xiaohongshu_ops',quantity:2,months:3,rate:1},{serviceId:'onsite_photo',quantity:1}]}
 const order=buildServicePurchase(input,config)
 assert.equal(order.amount,3900);assert.equal(order.currency,'SGD');assert.equal(order.items[0].quantity,6)
 assert.throws(()=>buildServicePurchase({...input,items:[{serviceId:'unknown',quantity:1}]},config),/不存在/)
 assert.throws(()=>buildServicePurchase({...input,items:[{serviceId:'onsite_photo',quantity:-1}]},config),/数量/)
 assert.throws(()=>buildServicePurchase({...input,deliveryDate:'2026-02-30'},config),/有效/)
})

import { syncSubscription } from '../src/lib/integrations/immediErpWorker.ts'
test('worker commits paid source and principal snapshot before send, recovers after failure, never reassigns historical sale', async () => {
 let stored:any={id:'SUBSCRIPTION:s',kind:'SUBSCRIPTION',sourceId:'s',attempts:0,status:'PENDING'}
 const merchant={id:'b',name:'Merchant',status:'ACTIVE',owner:{email:'merchant@example.com'},crew:{members:[{active:true,role:'PRINCIPAL',user:{id:'u1',email:'principal@example.com',type:'HUMAN',status:'ACTIVE'}}]}}
 const source={...sub,id:'s',status:'ACTIVE',feeWaived:false,paidAt:null,brandId:'b',brand:merchant,currency:'SGD',createdAt:new Date('2026-10-01T00:00:00Z')}
 let inTransaction=false,attempts=0,committedSnapshot:any
 const tx={$queryRaw:async()=>[{acquired:true}],brandSubscription:{findUnique:async()=>source},immediErpSync:{upsert:async()=>({...stored}),update:async({data}:any)=>{stored={...stored,...data,attempts:data.attempts?.increment?stored.attempts+1:(data.attempts??stored.attempts)};return stored}}}
 const database={$transaction:async(fn:any)=>{inTransaction=true;const result=await fn(tx);inTransaction=false;committedSnapshot=structuredClone(stored.payload);return result}}
 const config={...cfg,employeeMap:{u1:'erp-principal'}}
 const send=async(_:any,p:any)=>{attempts++;assert.ok(committedSnapshot);assert.equal(p.principal_employee_id,'erp-principal');assert.equal(p.amc_source.payment_status,'paid');assert.equal(p.amc_source.paid_at,null);return attempts===1?{ok:false,error:'lost response'}:{ok:true,erpOrderName:'SO1'}}
 await syncSubscription('s',config,{database,send});assert.equal(stored.status,'FAILED');assert.equal(attempts,1)
 stored.nextAttemptAt=new Date(0);merchant.crew.members=[]
 await syncSubscription('s',config,{database,send});assert.equal(stored.reference,'SO1');assert.equal(attempts,2)
 await syncSubscription('s',config,{database,send});assert.equal(attempts,2)
})
