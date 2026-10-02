import assert from 'node:assert/strict'
if (!process.env.DATABASE_URL?.endsWith('/amc_orders_route_test')) throw new Error('Dedicated isolated test database required')
process.env.JWT_SECRET='isolated-route-test-secret-not-production'
const {prisma}=await import('../src/lib/prisma.ts')
const {createSessionToken}=await import('../src/lib/auth-v2/session.ts')
const {GET,POST}=await import('../src/app/api/brands/[id]/orders/route.ts')
try {
 await prisma.user.createMany({data:[{id:'test-admin',email:'admin@example.test',password:'unused',type:'HUMAN',role:'ADMIN'},{id:'test-other',email:'other@example.test',password:'unused',type:'HUMAN',role:'USER'},{id:'test-principal',email:'principal@example.test',password:'unused',type:'HUMAN',role:'USER'}],skipDuplicates:true})
 await prisma.brand.upsert({where:{id:'test-brand'},create:{id:'test-brand',name:'Isolated route fixture',ownerId:'test-admin'},update:{}})
 await prisma.marketingCrew.upsert({where:{brandId:'test-brand'},create:{id:'test-crew',brandId:'test-brand',members:{create:{userId:'test-principal',role:'PRINCIPAL'}}},update:{}})
 await prisma.systemConfig.upsert({where:{id:'default'},create:{id:'default',immediErpEnabled:true,immediErpApiKey:'test-token',immediErpEmployeeMap:{'test-principal':'erp-principal'}},update:{immediErpEnabled:true,immediErpApiKey:'test-token',immediErpEmployeeMap:{'test-principal':'erp-principal'}}})
 const token=await createSessionToken({userId:'test-admin',type:'HUMAN',authVersion:1})
 const other=await createSessionToken({userId:'test-other',type:'HUMAN',authVersion:1})
 const path='http://localhost/api/brands/test-brand/orders',params={params:Promise.resolve({id:'test-brand'})}
 assert.equal((await GET(new Request(path),params)).status,401)
 assert.equal((await GET(new Request(path,{headers:{cookie:'session='+other}}),params)).status,403)
 const headers={cookie:'session='+token,'content-type':'application/json','idempotency-key':'isolated-test-request-123456'}
 const body={items:[{serviceId:'onsite_photo',quantity:2,rate:1}],deliveryDate:'2099-12-01',amount:1,currency:'USD',assigned_to:'bad@example.test'}
 const post=(input=body,more={})=>POST(new Request(path,{method:'POST',headers:{...headers,...more},body:JSON.stringify(input)}),params)
 assert.equal((await post(body,{origin:'https://attacker.example'})).status,403)
 const responses=await Promise.all([post(),post()]);assert.ok(responses.every(r=>[200,202].includes(r.status)),JSON.stringify(await Promise.all(responses.map(async r=>({status:r.status,body:await r.clone().json()})))))
 const ids=await Promise.all(responses.map(r=>r.json()));assert.equal(ids[0].id,ids[1].id)
 const rows=await prisma.immediServiceOrder.findMany({where:{brandId:'test-brand'}});assert.equal(rows.length,1);assert.equal(rows[0].payload.amount,600);assert.equal(rows[0].payload.currency,'SGD');assert.equal(rows[0].payload.principal_employee_id,'erp-principal')
 assert.equal((await post({...body,amount:2})).status,409)
 await prisma.immediErpSync.upsert({where:{id:'REWARDS:monthly'},create:{id:'REWARDS:monthly',kind:'REWARDS',sourceId:'monthly'},update:{}})
 await prisma.immediErpSync.update({where:{id:'REWARDS:monthly'},data:{status:'PARTIAL',payload:{rewards:[{brandId:'test-brand',employeeId:'erp-principal',period:'2026-10',entries:[{amount:700,currency:'SGD'}]},{brandId:'private-brand',employeeId:'private-person',period:'2026-10',entries:[{amount:3500,currency:'CNY'}]}],issues:[{brandId:'private-brand',reason:'private-issue'}]}}})
 const view=await (await GET(new Request(path,{headers}),params)).json();assert.equal(view.orders.length,1);assert.equal(view.orders[0].status,'PENDING')
 assert.equal(view.rewards.entries.length,1);assert.equal(view.rewards.entries[0].brandId,'test-brand');assert.equal(view.rewards.issues.length,0);assert.ok(!JSON.stringify(view).includes('private-person'));
 console.log('PASS: brand authorization, cross-origin guard, concurrent replay, immutable source and server pricing')
}finally{await prisma.$disconnect()}
