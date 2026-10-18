import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {requestInsight,readInsight,reconcileInsight} from '../src/lib/brand-plan/insight-service.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const brandId=randomUUID(),userId=randomUUID(),keys:string[]=[]
let submissions=0,networkLost=true
const adapters:any={loadBrand:async()=>({id:brandId}),buildReport:async(_brand:any,options:any)=>{submissions++;keys.push(options.requestKey);if(networkLost)throw Error('lost provider receipt');await options.onCreated('existing-provider-job');throw Object.assign(Error('running'),{code:'growth_research_still_running'})},saveReport:async()=>{throw Error('not completed')}}
try{
 await prisma.brand.create({data:{id:brandId,name:'Insight request test',status:'ARCHIVED'}})
 await assert.rejects(()=>requestInsight(brandId,userId,adapters),/insight_submission_unavailable/)
 const reserved=(await readInsight(brandId)).request!
 assert.equal(reserved.status,'submitting')
 networkLost=false
 const recovered=await requestInsight(brandId,userId,adapters)
 assert.equal(recovered.id,reserved.id);assert.equal(recovered.status,'processing');assert.equal(recovered.jobId,'existing-provider-job')
 assert.equal(keys[0],keys[1],'Unknown submission reuses the provider key')
 const all=await Promise.all(Array.from({length:4},()=>requestInsight(brandId,userId,adapters)))
 assert(all.every(v=>v.id===reserved.id));assert.equal(submissions,2,'Reload and duplicate requests do not submit an active job')
 assert.equal((await readInsight(brandId)).report,null,'A queued job is not a completed report')
 let savedReview=0
 const reviewAdapters:any={...adapters,readJob:async()=>({status:'needs_review',latest_report_markdown:'# Real report with explicit information gaps'}),buildReport:async()=>({reportMarkdown:'# Real report with explicit information gaps'}),saveReport:async()=>{savedReview++}}
 await reconcileInsight(brandId,reviewAdapters)
 assert.equal(savedReview,1,'A finished report with review gaps is synchronized and remains readable')
 assert.equal((await readInsight(brandId)).request?.status,'completed','Report generation completion does not imply merchant approval')
 console.log('PASS: durable request receipt, unknown outcome recovery, provider idempotency key, active request concurrency, no fabricated report')
}finally{await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.$disconnect()}
