import {randomUUID} from 'node:crypto'
import {saveVideoToLibrary} from '../src/lib/videoLibrary'
import assert from 'node:assert/strict'
import {PostgresWorkspaceStore} from '@immedi/iaic-core/workspace/store.js'
import {nativePool} from '../src/lib/ai-native/store'
import {merchantWorkspace,workspaceScope,validateWorkspaceDraft} from '../src/lib/merchant-workspace'
import {prisma} from '../src/lib/prisma'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const pool=nativePool();let allowed=true,authCalls=0
try{
 await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic');const store=new PostgresWorkspaceStore({pool});await store.initialize()
 const deps={store,authorize:async()=>{authCalls++;if(!allowed)throw Object.assign(Error('denied'),{statusCode:403})},assets:async(ids:string[])=>ids.includes('asset1')?[{id:'asset1',url:'https://owned.example/video.mp4',mimeType:'video/mp4'}]:[]}
 const run=(user:string,brand:string,input:any)=>merchantWorkspace(user,brand,input,deps)
 const draft={title:'云端草稿',language:'zh',versions:{zh:{script:'同一锅，20秒，无口播',originalScript:''}},assets:[{id:'asset1',url:'https://evil.example/steal',selected:true},{id:'missing',selected:true}],duration:20,platforms:['tiktok'],pendingRewrite:{language:'zh',body:{action:'rewrite',requestKey:'stable-request-123',script:'原稿'}},rewriteCandidate:{script:'私有候选'},priorRewriteTask:'private-task'}
 const first=await run('alice','brand-a',{action:'save',id:'draft1',expectedRevision:0,draft});assert.equal(first.revision,1)
 const read=await run('alice','brand-a',{action:'read',id:'draft1'});assert.equal(read.draft.assets[0].url,'https://owned.example/video.mp4');assert.deepEqual(read.draft.missingAssetIds,['missing']);assert.equal(read.draft.pendingRewrite.body.requestKey,'stable-request-123')
 assert.equal((await run('alice','brand-a',{action:'save',id:'draft1',expectedRevision:0,draft})).revision,1,'lost acknowledgement exact retry')
 await assert.rejects(()=>run('bob','brand-a',{action:'read',id:'draft1'}),{statusCode:404});await assert.rejects(()=>run('alice','brand-b',{action:'read',id:'draft1'}),{statusCode:404})
 const writes=await Promise.allSettled(['A','B'].map(script=>run('alice','brand-a',{action:'save',id:'draft1',expectedRevision:1,draft:{...draft,versions:{zh:{script,originalScript:''}}}})));assert.equal(writes.filter(x=>x.status==='fulfilled').length,1);assert.equal((writes.find(x=>x.status==='rejected') as any).reason.statusCode,409)
 assert.equal((await run('alice','brand-a',{action:'read',id:'draft1',revision:1})).draft.versions.zh.script,draft.versions.zh.script,'immutable prior version')
 const page=await run('alice','brand-a',{action:'list'});assert.equal(page.items[0].stage,'rewrite_pending');assert(!JSON.stringify(page).includes('原稿'));assert(!JSON.stringify(page).includes('私有候选'));assert(!JSON.stringify(page).includes('stable-request'))
 const shared=await run('alice','brand-a',{action:'share',id:'draft1',expectedRevision:2});const handoff=await run('bob','brand-a',{action:'read',id:shared.id,shared:true});assert(!handoff.draft.pendingRewrite);assert(!handoff.draft.priorRewriteTask);assert(!handoff.draft.rewriteCandidate)
 assert.equal((await run('alice','brand-a',{action:'share',id:'draft1',expectedRevision:2})).id,shared.id)
 await assert.rejects(()=>run('bob','brand-b',{action:'read',id:shared.id,shared:true}),{statusCode:404})
 await assert.rejects(()=>run('bob','brand-a',{action:'save',id:shared.id,shared:true,expectedRevision:1,draft}),{statusCode:403})
 await run('bob','brand-a',{action:'save',id:'copy1',expectedRevision:0,draft:handoff.draft});assert.equal((await run('bob','brand-a',{action:'read',id:'copy1'})).revision,1)
 allowed=false;for(const action of ['list','read','save','share'])await assert.rejects(()=>run('alice','brand-a',{action,id:'draft1',expectedRevision:2,draft}),{statusCode:403});allowed=true
 assert.throws(()=>validateWorkspaceDraft({...draft,versions:{zh:{script:'x'.repeat(12001),originalScript:''}}}))
 await assert.rejects(()=>run('alice','brand-a',{action:'read',id:'../draft1'}),{statusCode:400})
 for(let i=0;i<21;i++)await store.write(workspaceScope('alice','brand-a'),{path:'video/page'+String(i).padStart(2,'0'),expectedRevision:0,content:'{}',source:{kind:'test',title:'test',stage:'script_draft'}})
 const paged=await run('alice','brand-a',{action:'list'});assert.equal(paged.items.length,20);assert(paged.nextCursor);assert.equal((await run('alice','brand-a',{action:'list',after:paged.nextCursor})).items.length,2)
 await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
 const owner=randomUUID(),brand=randomUUID(),stranger=randomUUID()
 await prisma.user.create({data:{id:owner,email:`${owner}@fixture.invalid`,password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.user.create({data:{id:stranger,email:`${stranger}@fixture.invalid`,password:'fixture'}})
 await prisma.brand.create({data:{id:brand,name:'Workspace fixture',status:'ACTIVE',crew:{create:{members:{create:{userId:owner,role:'PRINCIPAL'}}}}}})
 const saved=await merchantWorkspace(owner,brand,{action:'save',id:'real-draft',expectedRevision:0,draft:{...draft,assets:[]}})
 await assert.rejects(()=>merchantWorkspace(stranger,brand,{action:'read',id:'real-draft'}),{statusCode:404})
 await assert.rejects(()=>merchantWorkspace(owner,brand,{action:'save',id:'real-draft',expectedRevision:1,expectedOwnerId:stranger,draft}),{statusCode:403})
 const jobId=randomUUID(),editor={brandId:brand,script:draft.versions.zh.script,assets:[],templateId:null,targetDurationSec:20,creativeId:null,workspaceDocument:{id:'real-draft',revision:saved.revision,digest:saved.digest}}
 await prisma.videoProductionJob.create({data:{id:jobId,brandId:brand,createdBy:owner,title:'Workspace result',platform:'tiktok',idea:editor.script,status:'completed',finalVideoUrl:'https://fixture.invalid/render.mp4',scenes:[],plan:{_mmVideoJob:{editor}}}})
 const linked=await merchantWorkspace(owner,brand,{action:'list'});assert.deepEqual((linked as any).items[0].productions,[{id:jobId,status:'completed',sourceRevision:1}])
 const library=await saveVideoToLibrary(owner,brand,{videoJobId:jobId});assert.equal((library.asset.technicalMetadata as any).videoDraft.editor.workspaceDocument.digest,saved.digest)
 assert.equal((await saveVideoToLibrary(owner,brand,{videoJobId:jobId})).asset.id,library.asset.id)
 console.log('PASS actual brand authorization and persisted draft → production → media-library provenance with idempotent archive (fixture rendered URL; no rendering provider called)')
 assert(authCalls>=20);console.log('PASS real PostgreSQL workspace: persisted recovery, metadata-only pagination, exact retry, concurrent conflict, immutable versions, owner/brand/revocation isolation, canonical assets, sanitized handoff and independent copy; zero model calls')
}finally{await pool.end();await prisma.$disconnect()}
