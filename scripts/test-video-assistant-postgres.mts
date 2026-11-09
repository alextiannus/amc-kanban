import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {videoAssistant} from '../src/lib/video-assistant/runtime.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {listBusinessTools,callBusinessTool} from '../src/lib/ai-native/business-tools.ts'
import {createAmcMcpServer} from '../src/lib/partner/mcp/server.ts'
import {principalFromUser} from '../src/lib/auth-v2/types.ts'
import {createSessionToken} from '../src/lib/auth-v2/session.ts'
import {verifyAccessIdentity} from '../src/lib/role-permissions/token.ts'
import {POST as confirmRoute} from '../src/app/api/video-assistant/confirm/[id]/route.ts'
import {GET as outputRoute} from '../src/app/api/video-assistant/output/route.ts'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
const database=new URL(process.env.DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert(database.pathname.startsWith('/amc_lineage_test_'))
const suffix=randomUUID(),userId='video-user-'+suffix,brandId='video-brand-'+suffix
const roleId='video-role-'+suffix
const realFetch=global.fetch;let renders=0,creations=0,failRender=false
const project:any={id:'basic_fixture_'+suffix,brandId,createdBy:userId,status:'draft',libraryState:'draft',title:'Fixture video',objective:'新品菜品特写',referenceAssetIds:[],input:{productionOptions:{voiceMode:'model',subtitlesEnabled:true}},shots:[{shotId:'s1',prompt:'新品菜品特写',durationSec:15}]}
global.fetch=async(input:any,init:any)=>{
 const url=new URL(typeof input==='string'?input:input.url)
 assert.equal(url.origin,'https://content.fixture.invalid')
 const headers=new Headers(init?.headers),identity=verifyAccessIdentity(headers.get('x-amc-access-identity'))
 assert.equal(identity?.sub,userId);assert.equal(identity?.brandId,brandId)
 assert.equal(headers.get('authorization'),'Bearer fixture-service-token')
 if(url.pathname.endsWith('/estimate'))return Response.json({confirmation:{id:randomUUID(),estimatedAmount:0.5,currency:'USD',expiresAt:new Date(Date.now()+900000).toISOString()},breakdown:{pricingConfigured:true},amcCredit:{amount:300,unit:'AMC Credit',chargePolicy:'reserve_settle_release'}})
 if(url.pathname.endsWith('/generate')){renders++;if(failRender)throw Error('lost response');project.status='processing';return Response.json(project)}
 if(url.pathname.endsWith('/confirm')){project.libraryState='completed';return Response.json({ok:true,assetId:'library-final'})}
 if(url.pathname.endsWith('/download'))return new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{headers:{'content-type':'video/mp4'}})
 if(url.pathname==='/v1/lab/basic-video/drafts'&&init.method==='POST')creations++
 if(url.pathname==='/v1/lab/basic-video/drafts'&&init.method==='GET')return Response.json({items:[project,{...project,id:'other',createdBy:'other-user'}]})
 return Response.json(project)
}
let client:Client|undefined,server:ReturnType<typeof createAmcMcpServer>|undefined
try{
 const user=await prisma.user.create({data:{id:userId,email:userId+'@example.invalid',type:'HUMAN',role:'ADMIN',password:'not-a-login-hash-local-fixture'},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
 await prisma.brand.create({data:{id:brandId,name:'Fixture brand'}})
 const principal=principalFromUser(user,'session'),actor={userId,authVersion:principal.authVersion}
 const catalog=await listBusinessTools(actorFor(brandId,userId),'video')
 assert.equal(catalog.tools.length,8);assert(catalog.tools.every(t=>!Object.hasOwn(t.inputSchema.properties||{},'brandId')))
 server=createAmcMcpServer(principal);client=new Client({name:'external-assistant-fixture',version:'1'})
 const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a)
 const external=await client.callTool({name:'video_get_project',arguments:{brandId,projectId:project.id}})
 const native=await callBusinessTool(actorFor(brandId,userId),'video_get_project',{projectId:project.id})
 assert.deepEqual(external.structuredContent,native.structuredContent)
 const createArgs={requestKey:'shared-create-'+suffix,prompt:'授权菜品营销短片',assetIds:[],language:'zh',platform:'tiktok',durationSec:15,aspectRatio:'9:16'}
 const nativeCreated=await callBusinessTool(actorFor(brandId,userId),'video_create_draft',createArgs)
 const externalReplay=await client.callTool({name:'video_create_draft',arguments:{...createArgs,brandId}})
 assert.deepEqual(nativeCreated.structuredContent,externalReplay.structuredContent);assert.equal(creations,1,'two assistants share the same persisted creation receipt')
 const revision=(external.structuredContent as any).revision
 const request={brandId,projectId:project.id,expectedRevision:revision,requestKey:'render-'+suffix}
 const [one,two]=await Promise.all([videoAssistant.call(actor,'video_request_generation',request),videoAssistant.call(actor,'video_request_generation',request)])
 const settled=await videoAssistant.call(actor,'video_request_generation',request);assert.equal(settled.state,'awaiting_input');assert.equal([one,two].filter(r=>r.state==='awaiting_input').length>=1,true);assert.equal(renders,0)
 const session=await createSessionToken({userId,type:'HUMAN',authVersion:principal.authVersion}),context={params:Promise.resolve({id:settled.approvalId})}
 const browserHeaders={cookie:'session='+session,origin:'https://amc.fixture.invalid','content-type':'application/json','sec-fetch-site':'same-origin'}
 const cross=await confirmRoute(new Request('https://amc.fixture.invalid/api/video-assistant/confirm/'+settled.approvalId,{method:'POST',headers:{...browserHeaders,origin:'https://evil.invalid','sec-fetch-site':'cross-site'},body:'{"confirmed":true}'}),context);assert.equal(cross.status,403)
 const key=await confirmRoute(new Request('https://amc.fixture.invalid/api/video-assistant/confirm/'+settled.approvalId,{method:'POST',headers:{...browserHeaders,authorization:'Bearer not-human'},body:'{"confirmed":true}'}),context);assert.equal(key.status,403)
 const approve=()=>confirmRoute(new Request('https://amc.fixture.invalid/api/video-assistant/confirm/'+settled.approvalId,{method:'POST',headers:browserHeaders,body:'{"confirmed":true}'}),context)
 const approved=await Promise.all([approve(),approve()]);assert(approved.every(r=>r.status===200));assert.equal(renders,1)
 // Repeated human confirmation uses the same persisted database receipt.
 const before=await prisma.auditLog.count({where:{actorId:userId,action:'VIDEO_ASSISTANT_RECEIPT'}})
 await videoAssistant.confirm(actor,settled.approvalId);assert.equal(renders,1);assert.equal(await prisma.auditLog.count({where:{actorId:userId,action:'VIDEO_ASSISTANT_RECEIPT'}}),before)
 const query=new URLSearchParams({brandId,projectId:project.id,mediaId:'m1'})
 const blocked=await outputRoute(new Request('https://amc.fixture.invalid/api/video-assistant/output?'+query,{headers:{cookie:'session='+session}}));assert.equal(blocked.status,409)
 project.status='complete';project.assemblyJob={id:'assembly1',status:'completed',outputs:[{id:'m1',mimeType:'video/mp4',url:'https://media.fixture.invalid/preview.mp4'}]}
 const current=await videoAssistant.call(actor,'video_get_project',{brandId,projectId:project.id})
 const review=await videoAssistant.call(actor,'video_request_review',{brandId,projectId:project.id,expectedRevision:current.revision,requestKey:'review-'+suffix})
 await videoAssistant.confirm(actor,review.approvalId)
 const response=await outputRoute(new Request('https://amc.fixture.invalid/api/video-assistant/output?'+query,{headers:{cookie:'session='+session}}))
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal((await response.arrayBuffer()).byteLength,8)
 assert.equal((await videoAssistant.call(actor,'video_list_projects',{brandId})).items.length,1)
 // A non-admin with explicit current grants has the same capability, without role escalation.
 await prisma.roleDefinition.create({data:{id:roleId,name:roleId,normalizedName:roleId,policy:{create:{grants:['content.video-making.read','content.video-making.create','content.video-making.generate','content.video-making.update']}}}})
 await prisma.userBusinessRole.create({data:{userId,role:roleId}})
 await prisma.brandOwner.create({data:{brandId,userId}})
 await prisma.marketingCrew.create({data:{brandId,members:{create:{userId,role:'OWNER',active:true}}}})
 await prisma.user.update({where:{id:userId},data:{role:'USER'}})
 const scoped=await videoAssistant.call(actor,'video_create_draft',{brandId,requestKey:'nonadmin-'+suffix,prompt:'Explicit authorized script',assetIds:[],language:'zh',platform:'tiktok',durationSec:15,aspectRatio:'9:16'})
 assert.equal(scoped.ok,true)
 await prisma.rolePermissionPolicy.update({where:{role:roleId},data:{grants:['content.video-making.read','content.video-making.update']}})
 const finalOnly=await videoAssistant.call(actor,'video_request_review',{brandId,projectId:project.id,expectedRevision:current.revision,requestKey:'review-only-'+suffix})
 assert.equal(finalOnly.state,'awaiting_input','review follows Content update permission, not generate')
 await prisma.rolePermissionPolicy.update({where:{role:roleId},data:{grants:['content.video-making.read']}})
 await assert.rejects(()=>videoAssistant.call(actor,'video_request_generation',request),/Permission denied/)
 await prisma.user.update({where:{id:userId},data:{status:'SUSPENDED'}})
 const revoked=await client.callTool({name:'video_get_project',arguments:{brandId,projectId:project.id}});assert.equal(revoked.isError,true)
 console.log('PASS real PostgreSQL + actual native in-process MCP/external MCP parity, signed Content identity, concurrent durable approvals/replay, session-only same-origin confirmation, final-review-gated byte stream and revoked identity')
}finally{
 global.fetch=realFetch
 await client?.close();await server?.close()
 await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}});await prisma.rolePermissionPolicy.deleteMany({where:{role:roleId}});await prisma.roleDefinition.deleteMany({where:{id:roleId}});await prisma.$disconnect()
}
