import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {prisma} from '../src/lib/prisma.ts'
import {readInsightSources,saveInsightSources} from '../src/lib/brand-plan/insight-sources.ts'
import {requestInsight} from '../src/lib/brand-plan/insight-service.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='127.0.0.1'&&url.pathname.startsWith('/amc_lineage_test_'))
const ids=[randomUUID(),randomUUID()],user=randomUUID(),fileId=randomUUID(),seen:any[]=[];let revision='a'.repeat(64),submitted=0
const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);seen.push(body);res.setHeader('content-type','application/json');res.end(JSON.stringify({revision,sources:body.sources||body.seed||[],needsRefresh:true,report:null}))})
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));process.env.AMC_GROWTH_API_URL=`http://127.0.0.1:${(server.address() as any).port}`;process.env.AMC_KNOWLEDGE_TOKEN='local-fixture-token'
try{
 for(const id of ids)await prisma.brand.create({data:{id,name:'Same name source fixture',location:'Singapore',status:'ARCHIVED'}})
 await prisma.mediaAsset.create({data:{id:fileId,brandId:ids[1],url:'https://example.com/original.pdf',filename:'original.pdf',mimeType:'application/pdf',sizeBytes:100,uploadedBy:user,sourceType:'fixture',assetKind:'document'}})
 await readInsightSources(ids[0]);await readInsightSources(ids[1]);assert.notEqual(seen[0].sourceKey,seen[1].sourceKey,'Same-name brands use distinct private configuration identities')
 await assert.rejects(()=>saveInsightSources(ids[0],user,{expectedRevision:revision,sources:[{id:'file',kind:'file',attachmentId:fileId,title:'Foreign file'}]}),/attachment_not_found/)
 await saveInsightSources(ids[1],user,{expectedRevision:revision,sources:[{id:'file',kind:'file',attachmentId:fileId,title:'Original file',url:'https://attacker.example/replace',notes:'Unread PDF'}]})
 const written=seen.at(-1);assert.equal(written.sources[0].url,'https://example.com/original.pdf');assert.equal(written.actorId,user);assert.equal(written.externalBrandId,ids[1])
 const adapters:any={loadBrand:async()=>({id:ids[0]}),buildReport:async(_b:any,options:any)=>{submitted++;assert.equal(options.sourceRevision,revision);return {content:'Fixture report'}},saveReport:async()=>{}}
 const first=await requestInsight(ids[0],user,adapters,{refresh:true,sourceRevision:revision,previousRequestId:null});assert.equal(first.status,'completed');assert.equal(submitted,1)
 const replay=await requestInsight(ids[0],user,adapters,{refresh:true,sourceRevision:revision,previousRequestId:null});assert.equal(replay.id,first.id);assert.equal(submitted,1,'Duplicate explicit refresh does not create a second report')
 revision='b'.repeat(64);await assert.rejects(()=>requestInsight(ids[0],user,adapters,{refresh:true,sourceRevision:'a'.repeat(64),previousRequestId:first.id}),/source_revision_conflict/);assert.equal(submitted,1)
 const second=await requestInsight(ids[0],user,adapters,{refresh:true,sourceRevision:revision,previousRequestId:first.id});assert.notEqual(second.id,first.id);assert.equal(submitted,2)
 console.log('PASS: private brand identity, attachment ownership, authoritative file URL, explicit report refresh, duplicate recovery and source revision binding')
}finally{server.close();await prisma.auditLog.deleteMany({where:{actorId:user}});await prisma.brand.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect()}
