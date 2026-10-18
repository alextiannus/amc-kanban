import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {readAvailableInsight} from '../src/lib/brand-plan/insight-service.ts'
import {growthInsightReport} from '../src/lib/brand-plan/insight-report.ts'
import {readGrowthReportArtifact} from '../src/lib/growthDataCenter.ts'
const db=new URL(process.env.DATABASE_URL||'');assert.equal(db.hostname,'127.0.0.1');assert(db.pathname.startsWith('/amc_lineage_test_'))
const brandId=randomUUID(),original=globalThis.fetch,paths:string[]=[]
let version='11',offline=false,detailFailure=false,pdf='/public/downloads/brand-intelligence-intake/real-11.pdf'
process.env.AMC_GROWTH_API_URL='http://growth.fixture'
try{
 await prisma.brand.create({data:{id:brandId,name:'PDF sync test',growthBrandKey:'bound-brand',status:'ARCHIVED'}})
 globalThis.fetch=async(input:any)=>{
  const path=new URL(String(input)).pathname;paths.push(path)
  if(offline)throw Error('offline')
  if(path.endsWith('/versions'))return Response.json({items:[{report_version_id:'10',tier:'initial',created_at:'2026-10-01',result:{report_template_version:'v3'}},{report_version_id:version,tier:'advanced',created_at:'2026-10-18'}]})
  if(path.includes('/downloads/'))return new Response('%PDF-1.7\nSAME VERSION BYTES',{headers:{'content-type':'application/pdf'}})
  if(detailFailure)return new Response('unavailable',{status:503})
  return Response.json({report:{report_version_id:version,brand_key:'bound-brand',tier:'advanced',created_at:'2026-10-18',report_content:'# Actual report\n\nHuman-readable content, not status JSON.\n\n| Channel | Finding |\n| --- | --- |\n| Instagram | Verified |',result:{status:'needs_review',pdf_download_path:pdf,missing_questions:['What budget is available?']}}})
 }
 const first=await readAvailableInsight(brandId)
 assert.equal(first.report?.id,'11');assert(first.report?.content.startsWith('# Actual report'));assert(!first.report?.content.includes('needs_review'))
 assert.equal(first.report?.pdfPath,pdf);assert(first.report?.pdfUrl?.endsWith('version=11'));assert.deepEqual(first.report?.supplementQuestions,['What budget is available?'])
 assert(paths.includes('/v1/admin/reports/bound-brand/versions'));assert(paths.includes('/v1/admin/report-versions/11'));assert(!paths.some(p=>p.includes('/10/')))
 const saved=await prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId}});assert(saved)
 await readAvailableInsight(brandId)
 assert.equal(await prisma.brandGrowthResearchSnapshot.count({where:{brandId}}),1)
 assert.equal((await prisma.brandGrowthResearchSnapshot.findUnique({where:{id:saved.id}}))?.updatedAt.toISOString(),saved.updatedAt.toISOString(),'Unchanged polling must not invalidate context caches')
 const artifact=await readGrowthReportArtifact(first.report!.pdfPath!)
 assert(Buffer.from(artifact.body).toString().startsWith('%PDF-'))
 offline=true
 const cached=await readAvailableInsight(brandId)
 assert.equal(cached.report?.id,'11');assert.equal(cached.liveStatus,'unavailable');assert.equal(cached.report?.pdfPath,pdf)
 offline=false;detailFailure=true
 assert.equal((await readAvailableInsight(brandId)).report?.id,'11','Read failure preserves the synced version')
 detailFailure=false;version='12';pdf='http://growth.fixture/downloads/brand-intelligence-intake/real-12.pdf'
 const newer=await readAvailableInsight(brandId);assert.equal(newer.report?.id,'12');assert.equal(newer.report?.pdfPath,'/downloads/brand-intelligence-intake/real-12.pdf')
 version='13';pdf='https://untrusted.example/downloads/brand-intelligence-intake/leak.pdf'
 const unsafe=await readAvailableInsight(brandId);assert.equal(unsafe.report?.id,'13');assert.equal(unsafe.report?.pdfUrl,undefined)
 assert.equal(growthInsightReport({report_version_id:'2',result:{status:'needs_review'}}),null,'Operational JSON cannot become report text')
 assert.equal(growthInsightReport({report_version_id:'3',report_content:'Real body',result:{pdf_download_path:'/downloads/brand-intelligence-intake/../../bad.pdf'}})?.pdfPath,undefined)
 console.log('PASS: latest advanced Growth report, canonical body/PDF same version, brand binding, persisted fallback, stable polling, version changes, missing/unsafe PDF, no operational JSON rendering')
}finally{globalThis.fetch=original;await prisma.brand.deleteMany({where:{id:brandId}});await prisma.$disconnect()}
