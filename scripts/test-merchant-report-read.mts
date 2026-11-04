import assert from 'node:assert/strict'
import {PDFDocument,PDFName,PDFString} from 'pdf-lib'
import {presentReportPdf,reportSourceHref} from '../src/lib/brand-plan/report-presentation.ts'
let snapshots:any[]=[],offline=false,live='12',posts=0,missingKey=false,cacheFailure=false
const db:any={$extends:()=>db,brand:{findUnique:async()=>({growthBrandKey:missingKey?null:'bound'})},
 $queryRaw:async()=>[{researchReport:{reportVersionId:'1',reportMarkdown:'Old local copy',generatedAt:'2026-10-01'},marketingSolution:{}}],
 brandMarketingSolution:{findMany:async()=>[{id:'monthly',status:'COMPLETED',generatedAt:new Date('2026-12-01'),output:{content:'Monthly must stay separate'}}]},
 brandGrowthResearchSnapshot:{findMany:async()=>snapshots,findFirst:async()=>missingKey?null:snapshots.at(-1)||null,findUnique:async({where}:any)=>snapshots.find(s=>s.id===where.id)||null,upsert:async({create,update,where}:any)=>{if(cacheFailure)throw Error('Cache write unavailable');const previous=snapshots.find(s=>s.id===where.id);if(previous)Object.assign(previous,update);else snapshots.push(create)}}}
;(globalThis as any).prisma=db
process.env.AMC_GROWTH_API_URL='https://growth.fixture'
const original=globalThis.fetch,source='a'.repeat(32),version='b'.repeat(64),sourceUrl=`https://amc-growth.immedi.ai/dashboard/jobs/ff4a4ee7-24d1-4df6-be3b-085fd2935b22?source=${source}&version=${version}`
globalThis.fetch=async(input:any,init:any)=>{
 if(init?.method!=='GET'){posts++;throw Error('Reading must never POST')}
 if(offline)throw Error('offline')
 const u=new URL(String(input)),id=u.pathname.includes('/latest')?(u.searchParams.get('language')==='en'?'8':live):u.pathname.split('/').at(-1)!
 if(id==='404')return Response.json({error:'deleted'},{status:404})
 return Response.json({report:{report_version_id:id,brand_key:id==='999'?'another-brand':id==='14'?'historical-key':'bound',kanban_brand_id:id==='14'?'brand':null,job_id:'another-job',tier:'initial',language:id==='8'?'en':'zh',created_at:'2026-11-04',report_content:`# Report ${id}\n[Source](<${sourceUrl}>)`,result:{template_id:'merchant_comprehensive',template_revision:id==='8'?'1.0.0':'1.1.0',generation_metadata:{cited_sources:[{source_id:source,version}]},pdf_download_path:'/downloads/brand-intelligence-intake/test.pdf'}}})
}
try{
 const {readAvailableInsight}=await import('../src/lib/brand-plan/insight-service.ts')
 const current=await readAvailableInsight('brand');assert.equal(current.report?.id,'12');assert.equal(current.report?.type,'research');assert.equal(snapshots.length,1)
 assert(current.report?.content.includes('/api/brands/brand/insight/source?report_version_id=12'))
 const english=await readAvailableInsight('brand',{language:'en'});assert.equal(english.report?.id,'8');assert.equal(english.report?.templateRevision,'1.0.0')
 live='13';assert.equal((await readAvailableInsight('brand')).report?.id,'13')
 assert.equal((await readAvailableInsight('brand',{version:'12'})).report?.id,'12','Pinned old version stays readable after a newer save')
 offline=true;const cached=await readAvailableInsight('brand');assert.equal(cached.report?.id,'13');assert.equal(cached.liveStatus,'unavailable')
 offline=false;assert.equal((await readAvailableInsight('brand',{version:'999'})).report,null,'No cross-brand version')
 assert.equal((await readAvailableInsight('brand',{version:'404'})).report,null,'Deleted version cannot revive from cache')
 missingKey=true;live='14';assert.equal((await readAvailableInsight('brand')).report?.id,'14','Trusted external merchant ID resolves historical keys even without a local Growth key');missingKey=false;cacheFailure=true;live='15';assert.equal((await readAvailableInsight('brand')).report?.id,'15','Cache writes cannot hide a saved upstream report');cacheFailure=false;
 const report=current.report!;assert.equal(reportSourceHref(report,'brand','https://example.com/news'),'https://example.com/news')
 const pdf=await PDFDocument.create(),page=pdf.addPage();page.node.set(PDFName.of('Annots'),pdf.context.obj([{Type:'Annot',Subtype:'Link',Rect:[0,0,100,20],A:{S:'URI',URI:PDFString.of(sourceUrl)}}]))
 const bytes=await presentReportPdf(await pdf.save(),report,'brand','https://amc-mm.immedi.ai')
 const parsed=await PDFDocument.load(bytes),ann:any=parsed.getPage(0).node.lookup(PDFName.of('Annots')),action:any=ann.lookup(0).lookup(PDFName.of('A'))
 assert(action.lookup(PDFName.of('URI')).decodeText().startsWith('https://amc-mm.immedi.ai/api/brands/brand/insight/source?report_version_id=12'))
 assert.equal(posts,0)
 console.log('PASS cross-job latest, old-template reading, language selection, pinned downloads, retained offline cache, cross-brand/deleted denial, same-version PDF source links and zero model POSTs.')
}finally{globalThis.fetch=original}
