import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {autopilotDb,initializeBrandAutopilotDefault} from '../src/lib/ai-native/autopilot-store.ts'
import {executeAutopilot,readAutopilot} from '../src/lib/ai-native/autopilot.ts'
import {digest} from '../src/lib/ai-native/contract.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const id='research-'+randomUUID(),runId=digest(id),pool=await autopilotDb(),original=globalThis.fetch
let approved=0,blockers=[{code:'ambiguous_place'}],status='evidence_review'
process.env.AMC_GROWTH_API_URL='https://research.fixture.invalid'
globalThis.fetch=async(url,init)=>{
 assert(String(url).startsWith('https://research.fixture.invalid/'))
 if(String(url).endsWith('autopilot-evidence')){
  assert.equal((init?.headers as any)['x-amc-brand-id'],id)
  assert.equal((init?.headers as any)['x-amc-actor-id'],id)
  if(init?.method==='POST'){approved++;return Response.json({status:'queued'})}
  return Response.json({latest_snapshot:{snapshot_id:7,evidence:{sources:[{url:'https://example.invalid/source'}]}},blockers,warnings:[{code:'missing_menu'}]})
 }
 return Response.json({status,job_id:'original-job'})
}
try {
 await prisma.user.create({data:{id,email:id+'@example.invalid',password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Known Brand',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await prisma.socialAccount.create({data:{id,brandId:id,platformId:'instagram',handle:'fixture'}})
 await initializeBrandAutopilotDefault(id)
 await pool.query(`INSERT INTO amc_iaic.autopilot_runs(id,brand_id,local_day,owner_id,account_id,config_revision,daily_limit,evidence) VALUES($1,$2,'2026-10-01',$2,$2,1,1,$3)`,[runId,id,JSON.stringify({researchJobId:'original-job'})])
 const read:any=await readAutopilot(id,id,runId,'research');assert.equal(read.ready,true);assert.equal(read.requiresEvidenceReview,true);assert.equal(read.snapshotId,'7')
 const review={snapshotId:'7',mode:'approve',note:'The place identity is ambiguous; only known brand facts can be used.'}
 await assert.rejects(()=>executeAutopilot(id,id,runId,'research_review',{...review,snapshotId:'8'}))
 await assert.rejects(()=>executeAutopilot(id,id,runId,'research_review',review))
 assert.equal(approved,0)
 await executeAutopilot(id,id,runId,'research_review',{...review,mode:'limited'})
 const limited:any=await readAutopilot(id,id,runId,'research');assert.equal(limited.ready,true);assert.equal(limited.limitedEvidence.fullReportAvailable,false)
 const strategy=await executeAutopilot(id,id,runId,'strategy',{title:'Generic brand strategy',content:'Use only the confirmed brand identity for introduction and audience questions. Do not use the ambiguous place or invent products. The source evidence is incomplete, so no full research report is claimed.'})
 const saved=await prisma.brandMarketingSolution.findUniqueOrThrow({where:{id:strategy.strategyVersionId}})
 assert.equal(saved.researchSnapshotId,null);assert.equal((saved.input as any).researchReview.snapshotId,'7');assert.equal((saved.input as any).researchReview.reviewerType,'AI')
 blockers=[];await executeAutopilot(id,id,runId,'research_review',review);assert.equal(approved,1)
 await executeAutopilot(id,id,runId,'research_review',review);assert.equal(approved,1)
 status='initial_ready';assert.equal((await readAutopilot(id,id,runId,'research') as any).ready,true)
 console.log('PASS: evidence review wakes Agent, scope headers, blockers, snapshot conflict, limited factual strategy, AI provenance, approval replay and initial_ready')
} finally {globalThis.fetch=original;await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}});await pool.end();await prisma.$disconnect()}
