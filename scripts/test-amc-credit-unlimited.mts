import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {ensureCreditAccount,reserveCredit,settleCredit,getCreditSnapshot} from '../src/lib/amc-credit/service.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const id='credit-meter-'+randomUUID()
try{
 await prisma.brand.create({data:{id,name:'Isolated meter-only fixture',status:'ARCHIVED',autoPilot:false}})
 await ensureCreditAccount(id)
 await prisma.amcCreditAccount.update({where:{brandId:id},data:{allowOverage:false,allowNightlyOverage:false,cycleAllowance:0}})
 await prisma.amcCreditCycle.updateMany({where:{brandId:id},data:{includedCredit:0}})
 const request={brandId:id,taskType:'fixture',taskId:id,credit:5000,idempotencyKey:id+'-reserve'}
 const first=await reserveCredit(request),replay=await reserveCredit(request);assert.equal(first.entry.id,replay.entry.id)
 const settled=await settleCredit({...request,credit:4321,idempotencyKey:id+'-settle',reservationKey:request.idempotencyKey,rawUsage:{inputTokens:4000,outputTokens:321}})
 await settleCredit({...request,credit:4321,idempotencyKey:id+'-settle',reservationKey:request.idempotencyKey})
 const snapshot=await getCreditSnapshot(id)
 assert.equal(snapshot.summary.used,4321);assert.equal(snapshot.summary.reserved,0);assert.equal(snapshot.summary.quotaEnforced,false)
 assert.equal(snapshot.entries.filter(e=>e.kind==='SETTLE').length,1)
 assert.equal(snapshot.account.allowOverage,false,'Historical settings remain auditable but do not block current policy')
 assert.deepEqual(settled.entry.rawUsage,{inputTokens:4000,outputTokens:321})
 console.log('PASS: zero-allocation historical restricted account reserves and settles exact actual usage once')
}finally{await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
