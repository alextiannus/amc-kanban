import {ContextAssembler} from '@immedi/iaic-core'
import {CapabilityDispatcher} from '@immedi/iaic-core/capabilities/index.js'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {businessArguments,businessTool,listBusinessTools,callBusinessTool,businessAllowed} from '../src/lib/ai-native/business-tools.ts'
import {durableBusinessWrite,businessCapabilities} from '../src/lib/ai-native/business-capabilities.ts'
import {allowedTaskTools} from '../src/lib/ai-native/task-tools.ts'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const id=randomUUID(),brand='business-'+id,user='user-'+id,actor=actorFor(brand,user)
try{
 await prisma.user.create({data:{id:user,email:user+'@example.invalid',type:'HUMAN',role:'ADMIN',password:'not-a-login-hash-local-fixture'}})
 await prisma.brand.create({data:{id:brand,name:'Fixture brand'}})
 const catalog=await listBusinessTools(actor)
 assert(catalog.tools.some(t=>t.name==='board_save_draft'))
 assert(catalog.tools.every(t=>!Object.hasOwn(t.inputSchema.properties,'brandId')))
 assert(catalog.tools.every(t=>!['publish','board_delete_asset','update_brand_config'].includes(t.name)))
 assert.throws(()=>businessArguments(actor,{brandId:'other'}),/host_brand/)
 assert.throws(()=>businessTool('publish'),/unavailable/)
 const infoResult=await callBusinessTool(actor,'get_brand_information',{})
 const info=JSON.parse(infoResult.content[0].text)
 assert.equal(info.name,'Fixture brand');assert(!JSON.stringify(info).includes('password'))
 const edit=await durableBusinessWrite(actor,randomUUID(),'update_brand_information',{patch:{description:'Updated through conversation'},expectedRevision:info.revision})
 assert.equal(edit.verified,true,JSON.stringify(edit));assert.equal((await prisma.brand.findUnique({where:{id:brand}}))?.description,'Updated through conversation')
 const conflict=await callBusinessTool(actor,'update_brand_information',{patch:{description:'Old overwrite'},expectedRevision:info.revision});assert.equal(conflict.isError,true)
 const forbidden=await callBusinessTool(actor,'update_brand_information',{patch:{apiKey:'forbidden'},expectedRevision:info.revision});assert.equal(forbidden.isError,true)
 const {savePlanningDocument}=await import('../src/lib/ai-native/planning-document.ts')
 const {planningRevision}=await import('../src/lib/ai-native/planning-workspace-contract.ts')
 const {readConversationInterview,saveConversationInterview}=await import('../src/lib/ai-native/interview-store.ts')
 let workspace:any={}
 const uiSaved=await savePlanningDocument(brand,user,{stage:'interview',action:'save',content:'UI interview facts',expectedRevision:planningRevision(workspace),expectedInterviewId:null,requestKey:'ui-interview'})
 const interview=await readConversationInterview(brand);assert.equal(interview.interview?.rawNotes,'UI interview facts')
 const enriched=JSON.parse((await callBusinessTool(actor,'get_brand_information',{})).content[0].text);assert(enriched.content.includes('UI interview facts'))
 await saveConversationInterview({brandId:brand,userId:user,taskId:randomUUID(),expectedRevision:interview.revision,answers:[{question:'Audience?',answer:'Local diners'}]})
 await assert.rejects(()=>savePlanningDocument(brand,user,{stage:'interview',action:'save',content:'Stale UI',expectedRevision:uiSaved.revision,expectedInterviewId:interview.interview?.id,requestKey:'stale'}),/interview_revision_conflict/)
 assert((await readConversationInterview(brand)).interview?.rawNotes.includes('Local diners'))
 console.log('PASS Profile fields MCP read/write, credential exclusion, revision conflict, UI interview visible to conversation and AI edits cannot be overwritten by stale UI')
 const asset=await prisma.mediaAsset.create({data:{brandId:brand,filename:'fixture.jpg',url:'/fixture.jpg',mimeType:'image/jpeg',sizeBytes:1,aiTags:[]}})
 await prisma.brandFolder.create({data:{brandId:brand,name:'产品素材',materialClass:'UNCONFIRMED'}})
 const args={assetId:asset.id,folder:'产品素材',aiTags:['已核实']},task=randomUUID()
 const saved=await durableBusinessWrite(actor,task,'board_update_asset',args)
 assert.equal(saved.verified,true,JSON.stringify(saved));assert.equal((await prisma.mediaAsset.findUnique({where:{id:asset.id}}))?.aiCategory,'产品素材')
 const replay=await durableBusinessWrite(actor,task,'board_update_asset',args);assert.deepEqual(replay,saved)
 const unknownTask=randomUUID();let attempts=0
 const failing=async()=>{attempts++;throw Error('lost response')}
 assert.equal((await durableBusinessWrite(actor,unknownTask,'board_save_draft',{caption:'unknown'},failing)).state,'unknown')
 assert.equal((await durableBusinessWrite(actor,unknownTask,'board_save_draft',{caption:'unknown'},failing)).state,'unknown');assert.equal(attempts,1)
 const parallelTask=randomUUID();let calls=0
 const action=async()=>{calls++;return {content:[],isError:false}}
 await Promise.all([durableBusinessWrite(actor,parallelTask,'board_save_topic',{title:'one'},action),durableBusinessWrite(actor,parallelTask,'board_save_topic',{title:'one'},action)])
 assert.equal(calls,1,'same task/input is reserved once')
 const draft=await durableBusinessWrite(actor,randomUUID(),'board_save_draft',{caption:'真实用户提供的草稿',accountId:'unconfigured_tiktok'})
 assert.equal(draft.verified,true,JSON.stringify(draft))
 const parsed=JSON.parse(draft.result.content[0].text),draftId=parsed.draft?.id||parsed.draftId
 assert(draftId)
 const read=await callBusinessTool(actor,'board_get_draft',{draftId});assert.equal(read.isError,undefined)
 assert.equal(JSON.parse(read.content[0].text).draft.caption,'真实用户提供的草稿')
 assert.deepEqual(allowedTaskTools(['amc.business.catalog','amc.business.read','amc.business.write'],{kind:'video_rewrite'} as any,[]),[])
 const caps=businessCapabilities(async()=>({kind:'conversation',brandId:brand} as any),async()=>true)
 const dispatcher=new CapabilityDispatcher({capabilities:caps,validateActor:()=>true}),context=new ContextAssembler({skillRoot:'.'})
 const history={calls:[{id:'saved-call',task_id:task,capability:'amc.business.write',status:'succeeded',input:{tool:'board_update_asset',arguments:args},result:saved}],events:[]}
 const before=await prisma.auditLog.count({where:{actorId:user}})
 const assemble=()=>context.assemble({actor,dispatcher,history,task:{input:{goal:'Organize asset'}},capability:{implementation:{instructions:'Continue',skills:[]}}} as any)
 assert.deepEqual(JSON.parse((await assemble()).at(-1)!.content).calls[0].result,saved)
 assert.equal(await prisma.auditLog.count({where:{actorId:user}}),before,'continuation never reexecutes a business write')
 console.log('PASS actual Core context continues after business save with original receipt and no duplicate effect')
 await prisma.user.update({where:{id:user},data:{status:'SUSPENDED'}})
 await assert.rejects(assemble,/no longer authorized/)
 assert.equal(await businessAllowed(actor,'board_save_draft',{}),false)
 await assert.rejects(()=>listBusinessTools(actor),/denied/)
 console.log('PASS actual in-process MCP business tools: exact catalog, host brand, draft save/readback, asset edit, no publish/delete/credential tools, durable replay/concurrency/unknown outcome and revoked identity')
}finally{
 await prisma.auditLog.deleteMany({where:{actorId:user}})
 await prisma.brand.deleteMany({where:{id:brand}})
 await prisma.user.deleteMany({where:{id:user}})
 await prisma.$disconnect()
}
