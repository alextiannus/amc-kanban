import assert from 'node:assert/strict'
import sharp from 'sharp'
import {prisma} from '../src/lib/prisma.ts'
import {AMC_BRAND_ID,dailySlots,inventory} from '../src/lib/daily-publishing/policy.ts'
import {dailyCard,normalizeDailyImage} from '../src/lib/daily-publishing/content.ts'
import {dailyDb} from '../src/lib/daily-publishing/store.ts'
import {configureDaily,dailyStatus,refillDaily,dailyAdapters} from '../src/lib/daily-publishing/service.ts'
import {dailySources,validateDailySource,validateDailyDraft} from '../src/lib/daily-publishing/sources.ts'
import {submitDraftForDelivery} from '../src/lib/draftSubmission.ts'
import {approveDaily} from '../src/lib/daily-publishing/approval.ts'
import {GET,POST} from '../src/app/api/brands/[id]/daily-publishing/route.ts'
import {createSessionToken} from '../src/lib/auth-v2/session.ts'
import {postInclude,postRevision} from '../src/lib/video-assistant/post-contract.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {listBusinessTools,callBusinessTool} from '../src/lib/ai-native/business-tools.ts'
import {processPostfastDeliveryQueue} from '../src/lib/postfastDelivery.ts'
const database=new URL(process.env.DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert(database.pathname.startsWith('/amc_lineage_test_'))
const uid='daily-test-user',bid=AMC_BRAND_ID,other='daily-other-brand',ctx={params:Promise.resolve({id:bid})}
const realFetch=global.fetch
let modelCalls=0,publishes=0,unknownPost=false
const portrait=await sharp({create:{width:900,height:1600,channels:3,background:'#ffcc33'}}).jpeg().toBuffer();const normalized=await sharp(await normalizeDailyImage(portrait)).metadata();assert.equal(normalized.width,1080);assert.equal(normalized.height,1350)
const image=await sharp({create:{width:1080,height:1350,channels:3,background:'#ffffdd'}}).png().toBuffer()
global.fetch=async(input:any,init:any)=>{
 const url=new URL(typeof input==='string'?input:input.url)
 if(url.origin==='https://api.postfa.st'){
  if(url.pathname==='/social-media/my-social-accounts')return Response.json([{id:'daily-pf',platform:'INSTAGRAM',platformUsername:'daily',isConnected:true,connectionStatus:'CONNECTED'}])
  if(url.pathname==='/file/get-signed-upload-urls')return Response.json({urls:[{uploadUrl:'https://upload.fixture.invalid/image',storageKey:'daily/image.png'}]})
  if(url.pathname==='/social-posts'&&(init?.method||'GET')==='GET')return Response.json({posts:[]})
  if(url.pathname==='/social-posts'){publishes++;return Response.json(unknownPost?{}:{postIds:['daily-published-id']})}
 }
 if(url.origin==='https://media.fixture.invalid')return new Response(new Uint8Array(image),{headers:{'content-type':'image/png','content-length':String(image.length)}})
 if(url.origin==='https://upload.fixture.invalid'){await new Response(init.body).arrayBuffer();return new Response('',{status:200})}
 throw Error('Unexpected fixture URL '+url.origin+url.pathname)
}
try{
 await prisma.user.create({data:{id:uid,email:uid+'@example.invalid',type:'HUMAN',role:'ADMIN',password:'local-fixture-only'}})
 await prisma.brand.createMany({data:[{id:bid,name:'AMC fixture',postfastApiKey:'fixture-never-real'},{id:other,name:'Other merchant'}]})
 const crew=await prisma.marketingCrew.create({data:{brandId:bid}})
 await prisma.crewMember.create({data:{crewId:crew.id,userId:uid,role:'PRINCIPAL'}})
 const a=await prisma.socialAccount.create({data:{brandId:bid,platformId:'instagram',handle:'daily',postfastAccountId:'daily-pf',connectionStatus:'CONNECTED'}})
 for(let i=0;i<8;i++)await prisma.schoolItem.create({data:{id:'daily-article-'+i,type:'ARTICLE',title:'Useful marketing tip '+i,markdown:'Plan a weekly content series. Choose one practical customer question, answer it clearly, and review results before the next iteration. '+i}})
 await prisma.mediaAsset.createMany({data:[{id:'daily-source-image',brandId:other,url:'https://media.fixture.invalid/source.png',filename:'food.png',mimeType:'image/png',aiReady:true,aiCaption:'A plate of dumplings',rightsStatus:'owned'},{id:'daily-denied-image',brandId:other,url:'https://media.fixture.invalid/denied.png',filename:'no.png',mimeType:'image/png',aiReady:true,aiCaption:'Do not use',rightsStatus:'revoked'}]})
 await prisma.contentDraft.createMany({data:[{id:'daily-public-example',brandId:other,caption:'A useful public post about dumplings.',status:'published',postUrl:'https://www.instagram.com/p/fixture',publishedAt:new Date()},{id:'daily-private-example',brandId:other,caption:'Private copy is not a published source.',status:'draft'}]})
 const sources=await dailySources();for(const source of sources)assert(await validateDailySource(source),'candidate fingerprint matches full source read: '+source.kind); assert(sources.some(s=>s.kind==='asset'&&s.brandId===other));assert(sources.some(s=>s.kind==='published'));assert(!sources.some(s=>s.id==='daily-denied-image'||s.id==='daily-private-example'))
 await assert.rejects(()=>dailyStatus(uid,other))
 const tools=await listBusinessTools(actorFor(bid,uid));assert(['daily_publishing_status','daily_publishing_sources','daily_publishing_refill'].every(n=>JSON.stringify(tools).includes(n)))
 const card=await sharp(Buffer.from(dailyCard('<script> x & y'))).metadata();assert.equal(card.width,1080);assert.equal(card.height,1350)
 assert.equal(dailySlots(new Date('2026-12-31T15:59:00Z'))[0].day,'2027-01-01')
 const configured=await configureDaily(uid,bid,{enabled:true,revision:0,accountIds:[a.id]});assert.equal(configured.policy.revision,1)
 const adapters={...dailyAdapters,compose:async(input:any)=>{modelCalls++;return {caption:'A practical marketing insight. '+input.source.id,hashtags:['AMC'],contentEngine:'amc-content' as const,fallbackUsed:false,mediaUrl:'https://media.fixture.invalid/'+input.id+'.png',mimeType:'image/png',title:'Marketing insight',bytes:image.length}}}
 const results=await Promise.all([refillDaily(bid,adapters,7),refillDaily(bid,adapters,7)])
 assert.equal(results.reduce((n,r)=>n+r.created,0),7);assert.equal(modelCalls,7)
 await refillDaily(bid,adapters,7);assert.equal(modelCalls,7,'restart does not repeat generation')
 const native=await callBusinessTool(actorFor(bid,uid),'daily_publishing_status',{});assert(!native.isError,JSON.stringify(native))
 let status=await dailyStatus(uid,bid);assert.equal(status.slots.length,7);assert.equal(status.inventory[0].missingDays.length,7);assert(!JSON.stringify(status).includes('fixture-never-real'));assert(!JSON.stringify(status.drafts).includes('postfastAccountId'))
 assert.equal(await prisma.notification.count({where:{userId:uid}}),1,'shortage reminders deduplicate')
 assert.equal((await GET(new Request('https://amc.fixture.invalid/api'),ctx)).status,401)
 const token=await createSessionToken({userId:uid,type:'HUMAN',authVersion:1}),headers={cookie:'session='+token,origin:'https://amc.fixture.invalid','content-type':'application/json','sec-fetch-site':'same-origin'}
 let d=status.drafts.find((d:any)=>status.slots.find(s=>s.draft_id===d.id)?.source.kind==='academy')!
 assert(d)
 assert.equal((await submitDraftForDelivery({brandId:bid,draftId:d.id,actorId:uid,forcePublish:true})).ok,false,'legacy forcePublish cannot bypass daily rights approval')
 const bad=await POST(new Request('https://amc.fixture.invalid/api',{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:JSON.stringify({action:'approve',draftId:d.id,revision:d.revision,confirmed:true,rightsConfirmed:true})}),ctx);assert.equal(bad.status,403)
 await assert.rejects(()=>approveDaily(uid,bid,{draftId:d.id,revision:d.revision,confirmed:true}),/daily_approval_required/)
 await prisma.contentDraft.update({where:{id:d.id},data:{caption:'Edited content.'}})
 await assert.rejects(()=>approveDaily(uid,bid,{draftId:d.id,revision:d.revision,confirmed:true,rightsConfirmed:true}),/daily_approval_stale/)
 d=(await dailyStatus(uid,bid)).drafts.find((x:any)=>x.id===d.id)!
 const approved=await POST(new Request('https://amc.fixture.invalid/api',{method:'POST',headers,body:JSON.stringify({action:'approve',draftId:d.id,revision:d.revision,confirmed:true,rightsConfirmed:true})}),ctx)
 const accepted=await approved.json();assert.equal(approved.status,200,JSON.stringify(accepted));assert.equal(accepted.result.ok,true,JSON.stringify(accepted));assert.equal(publishes,0)
 assert.equal(await prisma.postfastDeliveryJob.count({where:{draftId:d.id,status:'QUEUED'}}),1)
 assert.equal((await processPostfastDeliveryQueue({maxRuntimeMs:30000})).succeeded,1)
 assert.equal(publishes,1)
 const delivered=await prisma.contentDraft.findUniqueOrThrow({where:{id:d.id},include:postInclude});assert.equal(delivered.status,'scheduled');assert.equal(delivered.platformPostId,'daily-published-id');assert.equal((await dailyStatus(uid,bid)).inventory[0].approvedDays.length,1)
 const source=status.slots.find(s=>s.draft_id===d.id).source;await prisma.schoolItem.update({where:{id:source.id},data:{markdown:'This article was corrected.'}})
 assert.equal(await validateDailyDraft(delivered),false,'source changes invalidate before any further delivery')
 await prisma.contentDraft.update({where:{id:status.drafts.find((x:any)=>x.id!==d.id)!.id},data:{status:'failed',deliveryFailureCode:'POSTFAST_RESULT_UNKNOWN'}})
 await refillDaily(bid,adapters,7);await refillDaily(bid,adapters,7);assert.equal(modelCalls,7);assert.equal(await prisma.notification.count({where:{userId:uid}}),2)
 // Revalidate the source again at actual delivery, after human approval.
 let second=(await dailyStatus(uid,bid)).drafts.find((x:any)=>x.id!==d.id&&x.status==='draft')!
 let secondResult=await approveDaily(uid,bid,{draftId:second.id,revision:second.revision,confirmed:true,rightsConfirmed:true});assert.equal(secondResult.result.ok,true)
 let secondSlot=(await dailyStatus(uid,bid)).slots.find(s=>s.draft_id===second.id)
 if(secondSlot.source.kind==='academy')await prisma.schoolItem.update({where:{id:secondSlot.source.id},data:{markdown:'Withdrawn source.'}})
 else if(secondSlot.source.kind==='asset')await prisma.mediaAsset.update({where:{id:secondSlot.source.id},data:{rightsStatus:'revoked'}})
 else await prisma.contentDraft.update({where:{id:secondSlot.source.id},data:{status:'draft'}})
 assert.equal((await processPostfastDeliveryQueue({maxRuntimeMs:30000})).failed,1);assert.equal(publishes,1)
 const third=(await dailyStatus(uid,bid)).drafts.find((x:any)=>x.status==='draft'&&x.id!==second.id)!
 const thirdResult=await approveDaily(uid,bid,{draftId:third.id,revision:third.revision,confirmed:true,rightsConfirmed:true});assert.equal(thirdResult.result.ok,true)
 unknownPost=true
 assert.equal((await processPostfastDeliveryQueue({maxRuntimeMs:30000})).resultUnknown,1)
 await processPostfastDeliveryQueue({maxRuntimeMs:30000});assert.equal(publishes,2,'unknown acceptance must not create another post')
 await prisma.user.update({where:{id:uid},data:{role:'BRAND_OWNER'}});await assert.rejects(()=>dailyStatus(uid,bid));await prisma.user.update({where:{id:uid},data:{role:'ADMIN'}})
 await configureDaily(uid,bid,{enabled:false,revision:1,accountIds:[a.id]});assert.equal((await refillDaily(bid,adapters)).disabled,true)
 console.log('PASS cross-library/Academy/published source organization, revoked/private exclusion, diverse seven-day stock, concurrent/restart idempotency, exact session approval, queue -> provider schedule, changed source/content and CSRF protection, shortages/failure dedup, disabled policy')
}finally{
 global.fetch=realFetch
 await prisma.brand.deleteMany({where:{id:{in:[bid,other]}}});await prisma.schoolItem.deleteMany({where:{id:{startsWith:'daily-article-'}}});await prisma.user.deleteMany({where:{id:uid}});await (await dailyDb()).end();await prisma.$disconnect()
}
