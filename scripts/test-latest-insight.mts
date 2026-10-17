import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {readAvailableInsight} from '../src/lib/brand-plan/insight-service.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const brandId=randomUUID(),fetchOriginal=globalThis.fetch
try{
 await prisma.brand.create({data:{id:brandId,name:'Latest insight test',growthBrandKey:'test-bound-brand',status:'ARCHIVED'}})
 await prisma.brandKnowledge.create({data:{brandId,researchReport:{generatedAt:'2026-08-01',reportMarkdown:'Old baseline'}}})
 await prisma.brandMarketingSolution.create({data:{brandId,kind:'MANAGEMENT_REPORT',period:'2026-09',status:'COMPLETED',version:1,input:{source:'test'},output:{title:'September management',periodEnd:'2026-09-30',content:'Real saved monthly fixture'},generatedAt:new Date('2026-10-01')}})
 const paths:string[]=[]
 globalThis.fetch=async(input:any)=>{const path=new URL(String(input)).pathname;paths.push(path);return Response.json(path.endsWith('/versions')?{items:[{tier:'initial',report_version_id:10,created_at:'2026-09-01',result:{report_template_version:'v3'}}]}:{metadata:{generated_at:'2026-09-01'},findings:['Earlier research']})}
 const monthly=await readAvailableInsight(brandId)
 assert.equal(monthly.report?.title,'September management');assert.equal(monthly.status,'cached');assert(paths.every(p=>p.includes('test-bound-brand')||p.includes('/10/')))
 globalThis.fetch=async(input:any)=>Response.json(String(input).endsWith('/versions')?{items:[{tier:'initial',report_version_id:11,created_at:'2026-10-10',result:{report_template_version:'v3'}}]}:{metadata:{generated_at:'2026-10-10'},findings:['Newer verified research']})
 const fresh=await readAvailableInsight(brandId)
 assert.equal(fresh.report?.id,'11');assert.equal(fresh.status,'available');assert(fresh.report?.content.includes('Newer verified research'))
 globalThis.fetch=async()=>{throw Error('offline')}
 const fallback=await readAvailableInsight(brandId)
 assert.equal(fallback.report?.title,'September management');assert.equal(fallback.liveStatus,'unavailable');assert.equal(fallback.status,'cached')
 console.log('PASS: saved management vs baseline vs live report selection, brand-bound lookup, structured report reading, retained monthly report when Growth is unavailable')
}finally{globalThis.fetch=fetchOriginal;await prisma.brand.deleteMany({where:{id:brandId}});await prisma.$disconnect()}
