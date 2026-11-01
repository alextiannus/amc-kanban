import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {businessArguments,businessTool,listBusinessTools,callBusinessTool,businessAllowed} from '../src/lib/ai-native/business-tools.ts'
import {durableBusinessWrite} from '../src/lib/ai-native/business-capabilities.ts'
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
 const asset=await prisma.mediaAsset.create({data:{brandId:brand,filename:'fixture.jpg',url:'/fixture.jpg',mimeType:'image/jpeg',sizeBytes:1,aiTags:[]}})
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
 await prisma.user.update({where:{id:user},data:{status:'SUSPENDED'}})
 assert.equal(await businessAllowed(actor,'board_save_draft',{}),false)
 await assert.rejects(()=>listBusinessTools(actor),/denied/)
 console.log('PASS actual in-process MCP business tools: exact catalog, host brand, draft save/readback, asset edit, no publish/delete/credential tools, durable replay/concurrency/unknown outcome and revoked identity')
}finally{
 await prisma.auditLog.deleteMany({where:{actorId:user}})
 await prisma.brand.deleteMany({where:{id:brand}})
 await prisma.user.deleteMany({where:{id:user}})
 await prisma.$disconnect()
}
