import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {nativePool} from '../src/lib/ai-native/store'
import {merchantWorkspace} from '../src/lib/merchant-workspace'
import {setCreativeFavorite,listCreativeFavorites,completeFavoriteForVideo,favoriteId} from '../src/lib/creative-favorites'
import {prepareMonthlyShooting,listMonthlyShooting,updateMonthlyShooting} from '../src/lib/asset-library/monthly-shooting'
import {shootingNeeds,nextShootingMonth,monthAt,shootingCsv,shootingHtml} from '../src/lib/asset-library/shooting-plan'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const owner=randomUUID(),other=randomUUID(),outsider=randomUUID(),brand=randomUUID(),foreign=randomUUID(),pool=nativePool()
const sourceId='cre_favorite_fixture',creativeId='creative-fixture'
const script='镜头 1 · 0–4s\n场景：餐桌\n画面：铁锅炖大鹅冒热气\n素材类型：图片\n字幕：不应进入拍摄清单\n\n镜头 2 · 4–8s\n场景：厨房\n画面：师傅翻动铁锅炖大鹅\n口播：不应进入拍摄清单'
const draft={title:'大鹅的故事',creativeId,language:'zh',duration:8,platforms:['tiktok'],versions:{zh:{script,originalScript:script}},assets:[],bindings:{},passageVersion:2}
const rawSource={inspirationCreativeId:sourceId,sourceRevision:'r1',sourceDigest:'a'.repeat(64),sourceVideo:{title:'Source',videoUrl:'https://fixture.invalid/source.mp4'},sourceEvidence:{scope:'full_source'},scriptContent:{kind:'video',body:script},timeline:[{narrativePurpose:'story'}]}
const prepare=(revision=1,id='shoot-draft')=>prepareMonthlyShooting(owner,brand,{workspaceId:id,revision})
try{
 for(const id of [owner,other,outsider])await prisma.user.create({data:{id,email:`${id}@fixture.invalid`,password:'fixture',role:id===outsider?'STAFF':'ADMIN',type:'HUMAN',status:'ACTIVE'}})
 for(const id of [brand,foreign])await prisma.brand.create({data:{id,name:'Shooting fixture',timezone:'Asia/Singapore'}})
 await prisma.brandKnowledge.create({data:{brandId:brand,negPrompts:[],menuItems:[{id:'goose',name:'铁锅炖大鹅'}],marketingSolution:{publishingCalendar:{months:{'2026-11':[{id:creativeId,title:'大鹅的故事',inspirationCreativeId:sourceId,planning:script,nativeSourceSnapshot:{source:rawSource},creativeBrowserSelection:{policy:'creative-browser-v2',reason:'like',by:owner}}]}}}}})
 const need=shootingNeeds(draft,[{id:'goose',name:'铁锅炖大鹅'}]);assert.equal(need.length,2);assert.equal(need[0].mediaType,'image');assert.equal(need[1].scene,'厨房');assert.equal(need[0].sku,'铁锅炖大鹅');assert(!need.some(n=>n.requirement.includes('不应进入')))
 assert.equal(shootingNeeds({...draft,assets:[{id:'owned'}],bindings:{'passage-1':['owned'],'passage-2':['deleted']}},[]).length,1,'missing or deleted assets remain requested')
 assert.equal(nextShootingMonth([{period:'2026-10',status:'OPEN'}],'2026-11'),'2026-10');assert.equal(nextShootingMonth([{period:'2026-12',status:'COMPLETED'}],'2026-12'),'2027-01')
 assert(!shootingHtml('<script>', '2026-11',[{...need[0],requirement:'<img onerror=alert(1)>'}]).includes('<img'))
 assert(shootingCsv('2026-11',[{...need[0],sku:'  =1+1'}]).includes("'  =1+1"))
 assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1,'legacy liked item retained')
 const f=await setCreativeFavorite(owner,brand,{creativeId,saved:true});assert.equal(f.saved,true)
 const snapshot:any=(await prisma.brandMarketingSolution.findUnique({where:{id:f.id}}))!.output;assert.equal(snapshot.current.planning,script);assert.equal(snapshot.current.nativeSourceSnapshot.source.sourceDigest,rawSource.sourceDigest,'full selected snapshot survives compact browser reads')
 const originalFetch=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('source unavailable')};const retained=await listCreativeFavorites(owner,brand);assert.equal(retained.items.length,1);assert.equal(retained.items[0].sourceUnavailable,true)}finally{globalThis.fetch=originalFetch}
 assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1)
 assert.equal((await listCreativeFavorites(other,brand,true)).items.length,0,'favorites are personal')
 await assert.rejects(()=>setCreativeFavorite(outsider,brand,{creativeId,saved:true}),/denied/)
 await setCreativeFavorite(owner,brand,{sourceId,saved:false,expectedVersion:f.version});assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,0,'tombstone suppresses legacy like')
 await merchantWorkspace(owner,brand,{action:'save',id:'shoot-draft',expectedRevision:0,draft})
 await assert.rejects(()=>prepareMonthlyShooting(other,brand,{workspaceId:'shoot-draft',revision:1}),/not_found/)
 await assert.rejects(()=>prepareMonthlyShooting(owner,foreign,{workspaceId:'shoot-draft',revision:1}),/not_found/)
 await assert.rejects(()=>prepare(2),/revision_changed/)
 const result=await prepare();assert.equal(result.count,2);assert.equal(((await prisma.brandMarketingSolution.findUnique({where:{id:result.favorite.id}}))!.output as any).idea.workspace.id,'shoot-draft');assert.equal(result.month,monthAt(new Date(),'Asia/Singapore'));assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1)
 const favoriteVersion=result.favorite.version
 const same=await prepare();assert.equal(same.favorite.version,favoriteVersion,'retry must not increment favorite version after JSONB key reordering')
 await setCreativeFavorite(owner,brand,{sourceId,saved:false,expectedVersion:favoriteVersion})
 const resaved=await prepare();assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1,'prepare retry re-saves an explicitly removed favorite');assert(resaved.favorite.version>favoriteVersion)
 const repeats=await Promise.all([prepare(),prepare(),prepare()]);assert(repeats.every(r=>r.replayed));assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:brand,kind:'SHOOTING_REQUEST'}}),1)
 let plan=await listMonthlyShooting(owner,brand),month=plan.months.find(m=>m.month===result.month)!
 assert.equal(month.items.length,2);assert.equal(month.items[0].mediaType,'image')
 await assert.rejects(()=>updateMonthlyShooting(owner,brand,{action:'complete',id:month.id,version:month.version}),/incomplete/)
 await assert.rejects(()=>updateMonthlyShooting(owner,brand,{action:'check',version:1,itemId:month.items[0].id,done:true}),/invalid/)
 const first=month.items[0];await updateMonthlyShooting(owner,brand,{action:'check',id:first.requestId,version:first.requestVersion,itemId:first.id,done:true})
 await assert.rejects(()=>updateMonthlyShooting(owner,brand,{action:'check',id:first.requestId,version:first.requestVersion,itemId:first.id,done:false}),/changed/)
 const newDraft={...draft,title:'改稿',versions:{zh:{script:script+'\n动作：保持同一口锅',originalScript:script}}}
 await merchantWorkspace(owner,brand,{action:'save',id:'shoot-draft',expectedRevision:1,draft:newDraft});await prepare(2)
 plan=await listMonthlyShooting(owner,brand);month=plan.months.find(m=>m.month===result.month)!;assert(month.items[0].done,'unchanged shot keeps captured status');assert.equal(month.items.length,2,'revision replaces same-workspace request')
 for(const item of month.items.filter(i=>!i.done))await updateMonthlyShooting(owner,brand,{action:'check',id:item.requestId,version:item.requestVersion,itemId:item.id,done:true})
 month=(await listMonthlyShooting(owner,brand)).months.find(m=>m.month===result.month)!;await updateMonthlyShooting(owner,brand,{action:'complete',id:month.id,version:month.version})
 await merchantWorkspace(owner,brand,{action:'save',id:'next-shoot',expectedRevision:0,draft});const next=await prepare(1,'next-shoot');assert(next.month>result.month,'closed month never reopened')
 await assert.rejects(async()=>updateMonthlyShooting(owner,brand,{action:'check',id:first.requestId,version:(await prisma.brandMarketingSolution.findUnique({where:{id:first.requestId}}))!.version,itemId:first.id,done:false}),/completed/)
 const asset=await prisma.mediaAsset.create({data:{brandId:brand,url:'https://fixture.invalid/reference.jpg',mimeType:'image/jpeg'}})
 await merchantWorkspace(owner,brand,{action:'save',id:'complete-materials',expectedRevision:0,draft:{...draft,assets:[{id:asset.id,selected:true}],bindings:{'passage-1':[asset.id],'passage-2':[asset.id]}}})
 const beforeRequests=await prisma.brandMarketingSolution.count({where:{brandId:brand,kind:'SHOOTING_REQUEST'}});const ready=await prepare(1,'complete-materials');assert.equal(ready.count,0);assert.equal(ready.favorite.saved,true);assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:brand,kind:'SHOOTING_REQUEST'}}),beforeRequests,'no empty shooting request when all materials exist')
 // Updating an open request to fully bound materials removes stale pending needs,
 // while preserving photographed history even when the script changes.
 const pendingMonth=(await listMonthlyShooting(owner,brand)).months.find(m=>m.month===next.month)!
 const captured=pendingMonth.items[0]
 await updateMonthlyShooting(owner,brand,{action:'check',id:captured.requestId,version:captured.requestVersion,itemId:captured.id,done:true})
 await merchantWorkspace(owner,brand,{action:'save',id:'next-shoot',expectedRevision:1,draft:{...draft,versions:{zh:{script:script+'\n动作：新动作',originalScript:script}},assets:[{id:asset.id,selected:true}],bindings:{'passage-1':[asset.id],'passage-2':[asset.id]}}})
 const reconciled=await prepare(2,'next-shoot');assert.equal(reconciled.count,0)
 const remaining=(await listMonthlyShooting(owner,brand)).months.find(m=>m.month===next.month)!.items
 assert.equal(remaining.length,1,'fully bound update removes outstanding requests');assert.equal(remaining[0].id,captured.id);assert.equal(remaining[0].done,true,'captured history remains')
 assert((await prepare(2,'next-shoot')).replayed,'zero-missing-material updates also have retry receipts')
 const job={id:'job-fixture',brandId:brand,createdBy:owner,status:'failed',finalVideoUrl:null,plan:{_mmVideoJob:{editor:{creativeRevisionId:'rev1',sourceReference:{inspirationCreativeId:sourceId}}}}}
 await completeFavoriteForVideo(prisma,job);assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1)
 await completeFavoriteForVideo(prisma,{...job,status:'completed',finalVideoUrl:'https://fixture.invalid/final.mp4',createdBy:other});assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,1,'another user cannot remove owner favorite')
 await completeFavoriteForVideo(prisma,{...job,status:'completed',finalVideoUrl:'https://fixture.invalid/final.mp4'});assert.equal((await listCreativeFavorites(owner,brand,true)).items.length,0)
 assert.equal((await prisma.brandMarketingSolution.findUnique({where:{id:favoriteId(owner,brand,sourceId)}}))?.status,'COMPLETED')
 console.log('PASS real PostgreSQL: personal favorites, legacy tombstones, authorization, workspace isolation/revision, atomic prepare, concurrent retries, missing materials, grouping, safe exports, checkoff CAS, revision replacement, closed-month rollover, failed/successful replication lifecycle; no model/render calls')
}finally{await prisma.$disconnect();await pool.end()}
