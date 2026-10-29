import * as browseSource from '../src/lib/ai-native/browse-source.ts'
import * as browseKnowledge from '../src/lib/ai-native/browse-knowledge.ts'
import * as brainstormMatch from '../src/lib/ai-native/brainstorm-match.ts'
import * as sourceResolver from '../src/lib/brand-plan/creativeSourceEvidence.ts'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as visibility from '../src/lib/brand-plan/creativeVisibility.ts'
import * as contract from '../src/lib/ai-native/brainstorm-contract.ts'
import * as creativeContract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {canonicalCreativeSource} from '../src/lib/brand-plan/creativeSourceReference.ts'
import {digest,nativeError} from '../src/lib/ai-native/contract.ts'
import {creativeSourceScript} from '../src/lib/brand-plan/creativeSourceScript.ts'
import * as videoResolver from '../src/lib/ai-native/brainstorm-video.ts'
let rows:any[]=[],knowledge:any={marketingSolution:{annual:{keep:'existing'},publishingCalendar:{months:{}}}},audits:any[]=[],access=true,write=true,queryCount=0,failAudit=false,taskCalls=0,evidenceRevision='r1'
let evidenceTimeline:any[]=[],evidenceProjections:(string|undefined)[]=[]
const tasks=new Map<string,string>()
const filter=(where:any,row:any)=>Object.entries(where||{}).every(([key,value]:any)=>key==='period'&&typeof value==='object'?value.in.includes(row.period):row[key]===value)
const db:any={
 user:{findUnique:async()=>({id:'user',type:'HUMAN',status:'ACTIVE',businessRoles:[]})},
 brand:{findUnique:async()=>({id:'brand',name:'Merchant',description:'Real food',timezone:'Asia/Singapore'})},
 brandKnowledge:{findUnique:async()=>{queryCount++;return structuredClone(knowledge)},upsert:async(args:any)=>{assert.deepEqual(args.select,{id:true});return {id:"knowledge"}},update:async({data}:any)=>{knowledge={...knowledge,...structuredClone(data)};return knowledge}},
 brandMarketingSolution:{
  findFirst:async({where}:any)=>{queryCount++;return rows.filter(r=>filter(where,r)).sort((a,b)=>b.version-a.version)[0]||null},
  findMany:async({where,distinct,take}:any)=>{queryCount++;const found=rows.filter(r=>filter(where,r)).sort((a,b)=>b.version-a.version||b.createdAt-a.createdAt),seen=new Set();return found.filter(row=>!distinct||!seen.has(row.period)&&!!seen.add(row.period)).slice(0,take||Infinity)},
  create:async({data}:any)=>{const row={...structuredClone(data),id:'row-'+rows.length,createdAt:new Date()};rows.push(row);return row}},
 auditLog:{create:async({data}:any)=>{if(failAudit)throw Error('audit-failed');audits.push(data)}},
 $queryRaw:async()=>[],
}
let beforeTransaction:(()=>Promise<void>)|null=null
let queue=Promise.resolve()
db.$transaction=async(fn:any)=>{if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook()}const run=queue.then(async()=>{const before=structuredClone({rows,knowledge,audits});try{return await fn(db)}catch(e){({rows,knowledge,audits}=before);throw e}});queue=run.catch(()=>{});return run}
const deps:any={'./browse-source':browseSource,'./browse-knowledge':browseKnowledge,'./brainstorm-match':brainstormMatch,'../brand-plan/creativeSourceEvidence':sourceResolver,'../brand-plan/creativeSourceScript':{creativeSourceScript},'../brand-plan/creativeVisibility':visibility,
 './brainstorm-video':videoResolver,
 '../prisma':{prisma:db},'../user-management/brandAccess':{canUserAccessBrand:async(_b:any,_u:any,op:string)=>access&&(op==='READ'||write)},
 '../role-permissions/store':{readPolicies:async()=>({policies:{editor:{}}})},'../role-permissions/contract':{effectiveGrants:()=>write?['draft.update']:[]},'../auth-v2/types':{principalFromUser:()=>({globalRoles:[],permissionRoleIds:['editor']})},
 '../promotion-strategy/clients':{fetchBrandMatchingTags:async(context:any)=>({policy:'material-brand-tags-v2',tags:(context.keywords||'Real food').split(/[,，;；\n]+/).map((label:string)=>({id:'tag_'+label,label,aliases:[]}))}),fetchCreativeSourceEvidence:async(id:string,projection?:string)=>{evidenceProjections.push(projection);return {creativeId:id,sourceRevision:evidenceRevision,sourceDigest:'a'.repeat(64),originalVideoUrl:'https://media.example/video.mp4?secret=yes',timeline:evidenceTimeline}}},
 './facts':{skuFacts:()=>[],readBrandFacts:async()=>({id:'brand',name:'Merchant',description:'Real food',productCatalog:[]})},'./contract':{digest,nativeError},'./service':{},
 '../brand-plan/creativeRevisionContract':creativeContract,'../brand-plan/creativeRevisions':{readCreativeRevisions:async(_a:any,_b:any,_m:any,id:string)=>{const entry=Object.entries(knowledge.marketingSolution.publishingCalendar.months).flatMap(([month,items]:any)=>items.map((current:any)=>({month,current}))).find((i:any)=>i.current.id===id) as any;return {...entry,canOverwrite:true,expectedRevision:creativeContract.creativeDigest(entry.current)}}},
 '../brand-plan/creativeSourceReference':{canonicalCreativeSource},'../brand-plan/creativeSourceMedia':{streamSourceVideoMedia:async()=>new Response('video')},'./brainstorm-contract':contract,
}
let browseCalls=0
const clients=deps['../promotion-strategy/clients']
clients.fetchBrandKeywords=async()=>({revision:1,tags:[]})
clients.fetchBrainstormBrowse=async(ids:string[],context:any)=>{browseCalls++;return {brandTags:context?await clients.fetchBrandMatchingTags(context):null,items:await Promise.all(ids.map(async creativeId=>({creativeId,source:await clients.fetchCreativeSourceEvidence(creativeId)})))}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/brainstorm.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports)
const api=mod.exports
const source=(id:string,matchScore:number)=>({inspirationCreativeId:id,matchScore,sourceRevision:'r1',sourceDigest:'a'.repeat(64),sourceVideo:{title:id,videoUrl:'https://media.example/video.mp4?secret=yes'},sourceEvidence:{scope:'full_source',originalText:'Original source script',timeline:[{narrativePurpose:'Reveal contrast'}]},scriptContent:{kind:'video',opening:'Opening hook'},recommendationReason:'Matches the brand product'})
assert(!contract.eligibleBrainstormSource(source('cre_boundary',75)));assert(contract.eligibleBrainstormSource(source('cre_good',75.1)));assert(!contract.eligibleBrainstormSource(source('cre_bad',NaN)))
let listing=await api.listBrainstorm('user','brand',db);assert(listing.needsRefresh);assert.equal(rows.length,0);assert.deepEqual(listing.matchingTags,['Real food']);assert.equal(browseCalls,1)
let feedVersion=0
const match=async()=>({contentMatchRequestId:'match',creativeCandidates:feedVersion++?[source('cre_new',92),source('cre_like',80),source('cre_no',90)]:[source('cre_boundary',75),source('cre_like',80),source('cre_no',90),source('cre_later',88)],contentLibraryGaps:[]})
listing=await api.refreshBrainstorm('user','brand',{action:'refresh'},db,match)
assert.deepEqual(listing.items.map((i:any)=>i.sourceId),['cre_like','cre_no','cre_later']);assert.equal(taskCalls,0);assert.deepEqual(knowledge.marketingSolution.publishingCalendar.months,{})
assert.equal(listing.items[0].originalScript,'');assert(!JSON.stringify(listing).includes('secret=yes'));assert.deepEqual(listing.items[0].viralElements,['Opening hook','Reveal contrast'])
const choose=(sourceId:string,decision:string,expectedVersion=0)=>api.decideBrainstorm('user','brand',{action:'decide',sourceId,decision,expectedVersion,sourceDigest:'a'.repeat(64)},db)
const both=await Promise.all([choose('cre_like','like'),choose('cre_like','like')]);assert(both.some((r:any)=>r.replayed));const liked=both[0]
const items:any[]=Object.values(knowledge.marketingSolution.publishingCalendar.months).flat();assert.equal(items.length,1);assert.equal(items[0].planning,'');assert.equal(items[0].date,null);assert.equal(items[0].schedule,null);assert.equal(taskCalls,0);assert.equal(knowledge.marketingSolution.annual.keep,'existing')
await choose('cre_no','dislike');await choose('cre_later','defer')
listing=await api.listBrainstorm('user','brand',db);assert.deepEqual(listing.items.map((i:any)=>i.sourceId),['cre_later'])
listing=await api.refreshBrainstorm('user','brand',{action:'refresh',force:true},db,match);assert(!listing.items.some((i:any)=>['cre_no','cre_like'].includes(i.sourceId)));assert(listing.items.some((i:any)=>i.sourceId==='cre_later'))
await assert.rejects(choose('cre_no','like',1),(e:any)=>e.code==='brainstorm_decision_changed')
// Roll back a failed audit before enrolling the new creative.
const beforeFailure=structuredClone({rows,knowledge,audits});failAudit=true
await assert.rejects(choose('cre_new','like',0),/audit-failed/);failAudit=false
assert.deepEqual({rows,knowledge,audits},beforeFailure)
// A defer committed while matching is in flight survives the replacement feed.
beforeTransaction=async()=>{await choose('cre_new','defer')}
listing=await api.refreshBrainstorm('user','brand',{action:'refresh',force:true},db,async()=>({contentMatchRequestId:'race',creativeCandidates:[],contentLibraryGaps:[]}))
assert(listing.items.some((i:any)=>i.sourceId==='cre_new'&&i.decision==='defer'))
const latestFeed=rows.filter(r=>r.kind===contract.BRAINSTORM_FEED).at(-1);latestFeed.createdAt=new Date(Date.now()-31*60000)
assert((await api.listBrainstorm('user','brand',db)).needsRefresh);latestFeed.createdAt=new Date()
const create=async(_u:string,_b:string,body:any)=>{taskCalls++;assert.equal(body.kind,'creative');assert(!body.adaptToBrand);if(!tasks.has(body.requestKey))tasks.set(body.requestKey,'task-'+tasks.size);return {id:tasks.get(body.requestKey)}}
const first=await api.replicateBrainstorm('user','brand',{action:'replicate',creativeId:liked.creativeId},db,create),second=await api.replicateBrainstorm('user','brand',{action:'replicate',creativeId:liked.creativeId},db,create);assert.equal(first.id,second.id);assert.equal(tasks.size,1)
delete items[0].brainstorm;await api.replicateBrainstorm('user','brand',{action:'replicate',creativeId:liked.creativeId},db,create)
evidenceRevision='r2';const taskCount=taskCalls;await assert.rejects(api.replicateBrainstorm('user','brand',{action:'replicate',creativeId:liked.creativeId},db,create),(e:any)=>e.code==='creative_source_changed');assert.equal(taskCalls,taskCount);evidenceRevision='r1'
access=false;const queries=queryCount;await assert.rejects(api.listBrainstorm('user','foreign',db),(e:any)=>e.code==='brainstorm_access_denied');assert.equal(queryCount,queries);access=true
write=false;await assert.rejects(choose('cre_later','like',1),(e:any)=>e.code==='brainstorm_access_denied');write=true
await assert.rejects(api.brainstormVideo('user','brand','cre_no',undefined,db),(e:any)=>e.code==='brainstorm_source_not_found')
assert.equal((await api.brainstormVideo('user','brand','cre_new',undefined,db)).status,200)
assert.equal(evidenceProjections.at(-1),'media','playback must not transfer the full original script')
evidenceRevision='changed';await assert.rejects(api.brainstormVideo('user','brand','cre_new',undefined,db),(e:any)=>e.code==='creative_source_changed');evidenceRevision='r1'
// A saved idea can later be disliked, without deleting its source/script/schedule.
const stored=Object.values(knowledge.marketingSolution.publishingCalendar.months).flat()[0] as any
stored.planning='Saved brand script';stored.schedule={draftId:'keep-scheduled-draft'}
const original=structuredClone(stored),month=Object.keys(knowledge.marketingSolution.publishingCalendar.months)[0]
knowledge.marketingSolution.publishingCalendar.months['2026-01']=[{...structuredClone(stored),id:'another-source-version'}]
const dismissBody={action:'dismiss',creativeId:stored.id,expectedRevision:creativeContract.creativeDigest(stored)}
await assert.rejects(api.dismissCalendarCreative('user','brand',{...dismissBody,expectedRevision:'0'.repeat(64)},db),(e:any)=>e.code==='creative_revision_conflict')
const snapshot=structuredClone({rows,knowledge,audits});failAudit=true;await assert.rejects(api.dismissCalendarCreative('user','brand',dismissBody,db),/audit-failed/);failAudit=false;assert.deepEqual({rows,knowledge,audits},snapshot)
await api.dismissCalendarCreative('user','brand',dismissBody,db)
assert((await api.dismissCalendarCreative('user','brand',dismissBody,db)).replayed)
const removed=knowledge.marketingSolution.publishingCalendar.months[month][0]
assert.deepEqual(removed.source,original.source);assert.equal(removed.planning,original.planning);assert.deepEqual(removed.schedule,original.schedule)
assert.equal(removed.brandDismissal.decision,'dislike');assert.equal(knowledge.marketingSolution.publishingCalendar.months['2026-01'][0].brandDismissal.decision,'dislike')
assert.equal(rows.filter(r=>r.kind===contract.BRAINSTORM_DECISION&&r.period==='cre_like').at(-1).input.decision,'dislike')
await assert.rejects(api.replicateBrainstorm('user','brand',{action:'replicate',creativeId:stored.id},db,create),(e:any)=>e.code==='brainstorm_source_not_found')
write=false;await assert.rejects(api.dismissCalendarCreative('user','brand',dismissBody,db),(e:any)=>e.code==='brainstorm_access_denied');write=true
// Returned selections preserve edits and roll back when the audit cannot commit.
const returned={id:'returned',title:'Old saved idea',planning:'Keep historical script'}
knowledge.marketingSolution.publishingCalendar.months['2026-02']=[returned]
const returnedBody={action:'decideSaved',creativeId:returned.id,expectedRevision:creativeContract.creativeDigest(returned),decision:'like'}
const beforeReturned=structuredClone({rows,knowledge,audits});failAudit=true
await assert.rejects(api.decideSavedBrainstorm('user','brand',returnedBody,db),/audit-failed/);failAudit=false;assert.deepEqual({rows,knowledge,audits},beforeReturned)
write=false;await assert.rejects(api.decideSavedBrainstorm('user','brand',returnedBody,db),(e:any)=>e.code==='brainstorm_access_denied');write=true
const returnedResults=await Promise.all([api.decideSavedBrainstorm('user','brand',returnedBody,db),api.decideSavedBrainstorm('user','brand',returnedBody,db)])
assert.equal(returnedResults.filter((r:any)=>!r.replayed).length,1)
assert(visibility.creativeIsSelected(knowledge.marketingSolution.publishingCalendar.months['2026-02'][0]));assert.equal(knowledge.marketingSolution.publishingCalendar.months['2026-02'][0].planning,returned.planning)
console.log('PASS: >75 source-only feed, brand-scoped choices, durable dislikes/defer, concurrent/idempotent likes, atomic audit, no rewrite before Replicate, task-key resume and authorized source media')

// Keyword matching, persistence, cache, permissions, failure and concurrent edits.
let captured:any[]=[]
const keywordMatch=async(input:any)=>{captured.push(input);return {contentMatchRequestId:'keywords',creativeCandidates:[source('cre_keywords',91)],contentLibraryGaps:[]}}
const updateKeywords=(keywords:any,expectedKeywords:any,matcher=keywordMatch)=>api.refreshBrainstorm('user','brand',{action:'refresh',keywords,expectedKeywords},db,matcher)
listing=await updateKeywords('  早餐  手工包子 ','')
assert.equal(listing.matchKeywords,'早餐 手工包子');assert.equal(listing.items[0].sourceId,'cre_keywords')
assert(captured[0].sellingPoint.startsWith('早餐 手工包子'));assert(captured[0].sellingPoint.includes('Merchant'));assert(captured[0].promotionGoal.includes('早餐 手工包子'))
assert.equal((await api.listBrainstorm('user','brand',db)).matchKeywords,'早餐 手工包子')
await api.refreshBrainstorm('user','brand',{action:'refresh',keywords:'早餐 手工包子',expectedKeywords:'早餐 手工包子',force:false},db,keywordMatch);assert.equal(captured.length,1,'unchanged keyword submission reuses the existing match')
await api.refreshBrainstorm('user','brand',{action:'refresh'},db,keywordMatch);assert.equal(captured.length,1)
await api.refreshBrainstorm('user','brand',{action:'refresh',force:true},db,keywordMatch);assert.equal(captured.length,2);assert(captured[1].sellingPoint.startsWith('早餐 手工包子'))
for(const keywords of [null,[],{},'x'.repeat(301)])await assert.rejects(updateKeywords(keywords,'早餐 手工包子'),(e:any)=>e.code==='invalid_match_keywords')
await assert.rejects(updateKeywords('other',''),(e:any)=>e.code==='brainstorm_keywords_changed')
write=false;await assert.rejects(updateKeywords('other','早餐 手工包子'),(e:any)=>e.code==='brainstorm_access_denied');write=true
await assert.rejects(updateKeywords('failed','早餐 手工包子',async()=>{throw Error('provider-failed')}),/provider-failed/)
assert.equal((await api.listBrainstorm('user','brand',db)).matchKeywords,'早餐 手工包子')
beforeTransaction=async()=>{await updateKeywords('winner','早餐 手工包子')}
await assert.rejects(updateKeywords('loser','早餐 手工包子'),(e:any)=>e.code==='brainstorm_keywords_changed')
assert.equal((await api.listBrainstorm('user','brand',db)).matchKeywords,'winner')
listing=await updateKeywords('   ','winner');assert.equal(listing.matchKeywords,'');assert.equal(captured.at(-1).brandTagContext.description,'Real food');assert.equal(captured.at(-1).sellingPoint,'Merchant；Real food')
console.log('PASS: keyword provider payload, persistence, cache, reset, validation, permission, failure preservation and concurrent edit protection')

// A refreshed match must use its new score/evidence, even when an older pool row exists.
db.$queryRaw=async(strings:any)=>String(strings).includes('to_regclass')?[{name:'amc_iaic.brand_ideas'}]:String(strings).includes('SELECT id,source_id')?[{id:'old-pool-row',source_id:'cre_keywords',source:{...source('cre_keywords',80),sourceRevision:'stale'}}]:[]
listing=await api.listBrainstorm('user','brand',db)
const refreshed=listing.items.find((i:any)=>i.sourceId==='cre_keywords')
assert.equal(refreshed.matchScore,91);assert.equal(refreshed.poolIdeaId,undefined)
await api.decideBrainstorm('user','brand',{action:'decide',sourceId:refreshed.sourceId,sourceDigest:refreshed.sourceDigest,decision:'defer',expectedVersion:0},db)
console.log('PASS: refreshed evidence takes priority over stale pool duplicates and remains actionable')

assert.equal((await api.brainstormVideo('user','brand','cre_keywords',undefined,db)).status,200)

// Replication is independent of choices, including old/disliked copies of the source.
rows.push({id:'copy-feed',brandId:'brand',kind:contract.BRAINSTORM_FEED,period:'sources',version:999,createdAt:new Date(),output:{sources:[{...source('cre_copy',91),sourceEvidence:{originalText:'好喜欢重庆 #重庆美食',timeline:[{startSec:0,endSec:2,visualDescription:'竹签上的食物',voiceover:'新鲜现做'},{startSec:2,endSec:4,visualDescription:'餐厅全景',cameraMovement:'缓慢推进'}]}}]}})
const copyBody={action:'copy',sourceId:'cre_copy',requestKey:'copy-request-00000001'}
const beforeCopy=structuredClone({rows,knowledge,audits});failAudit=true
await assert.rejects(api.copyBrainstorm('user','brand',copyBody,db),/audit-failed/);failAudit=false;assert.deepEqual({rows,knowledge,audits},beforeCopy)
const copied=await Promise.all([api.copyBrainstorm('user','brand',copyBody,db),api.copyBrainstorm('user','brand',copyBody,db)])
assert.equal(copied[0].creativeId,copied[1].creativeId);assert.equal(copied.filter((r:any)=>r.replayed).length,1)
const firstCopy=knowledge.marketingSolution.publishingCalendar.months[copied[0].month].find((i:any)=>i.id===copied[0].creativeId)
assert(firstCopy.planning.includes('镜头 1 · 0–2s'));assert(firstCopy.planning.includes('餐厅全景'));assert(!firstCopy.planning.includes('#重庆美食'));assert(copied[0].revisionId);assert.equal(rows.find(r=>r.id===copied[0].revisionId).output.planning,firstCopy.planning);firstCopy.planning='User script stays intact';firstCopy.schedule={draftId:'original-schedule'};firstCopy.brandDismissal={decision:'dislike'};firstCopy.status='archived'
const originalCopy=structuredClone(firstCopy),choiceCount=rows.filter(r=>r.kind===contract.BRAINSTORM_DECISION).length
const nextCopy=await api.copyBrainstorm('user','brand',{action:'copy',creativeId:firstCopy.id,requestKey:'copy-request-00000002'},db)
assert.notEqual(nextCopy.creativeId,firstCopy.id)
const nextItem=knowledge.marketingSolution.publishingCalendar.months[nextCopy.month].find((i:any)=>i.id===nextCopy.creativeId)
assert.equal(nextItem.planning,firstCopy.planning);assert.equal(nextItem.schedule,null);assert.equal(nextItem.brandDismissal,undefined);assert.equal(nextItem.status,'idea_pending')
assert.deepEqual(knowledge.marketingSolution.publishingCalendar.months[copied[0].month].find((i:any)=>i.id===firstCopy.id),originalCopy)
assert.equal(rows.filter(r=>r.kind===contract.BRAINSTORM_DECISION).length,choiceCount)
await assert.rejects(api.copyBrainstorm('user','brand',{...copyBody,sourceId:'cre_other'},db),(e:any)=>e.code==='idempotency_conflict')
write=false;await assert.rejects(api.copyBrainstorm('user','brand',copyBody,db),(e:any)=>e.code==='brainstorm_access_denied');write=true
await assert.rejects(api.copyBrainstorm('user','brand',{...copyBody,requestKey:'copy-request-00000003',sourceId:'cre_missing'},db),(e:any)=>e.code==='brainstorm_source_not_found')
console.log('PASS: copy bypasses choice state, preserves original, clears scheduling, creates separate versions, replays once, enforces permissions and atomic audit')

// Older snapshots contain only captions: resolve pinned shots, never reuse caption.
evidenceTimeline=[{startSec:0,endSec:1,visualDescription:'完整源镜头',voiceover:'真实口播'}]
rows.push({id:'sparse-copy-feed',brandId:'brand',kind:contract.BRAINSTORM_FEED,period:'sources',version:1000,createdAt:new Date(),output:{sources:[source('cre_sparse',91)]}})
const sparse=await api.copyBrainstorm('user','brand',{action:'copy',sourceId:'cre_sparse',requestKey:'copy-sparse-0000001'},db)
const sparseItem=knowledge.marketingSolution.publishingCalendar.months[sparse.month].find((i:any)=>i.id===sparse.creativeId)
assert(sparseItem.planning.includes('完整源镜头'));assert(!sparseItem.planning.includes('Original source script'));assert.equal(rows.find(r=>r.id===sparse.revisionId).output.id,sparse.creativeId)
console.log('PASS: caption-only cached source resolves pinned timeline and creates a usable initial revision')

// Legacy items accepted by browsing must also be copyable without canonical source.
const legacyItem={id:'legacy-browser',title:'Legacy',inspirationCreativeId:'cre_legacy',nativeSourceSnapshot:{source:{inspirationCreativeId:'cre_legacy',sourceRevision:'r1',sourceDigest:'a'.repeat(64)}}}
Object.values(knowledge.marketingSolution.publishingCalendar.months)[0].push(legacyItem)
const legacyCopy=await api.copyBrainstorm('user','brand',{action:'copy',creativeId:legacyItem.id,requestKey:'legacy-copy-request-1'},db)
assert(legacyCopy.current.planning.includes('画面：'))
assert.equal(legacyCopy.current.source.sourceRevision,'r1')
assert.equal(legacyCopy.current.source.inspirationCreativeId,'cre_legacy')
assert(!legacyItem.source)
console.log('PASS legacy browser source copy shares evidence resolver and returns initial script/revision')

const originalMode=await api.copyBrainstorm('user','brand',{action:'copy',creativeId:firstCopy.id,scriptMode:'original',requestKey:'original-script-copy-1'},db)
assert.equal(originalMode.current.planning,creativeSourceScript({timeline:evidenceTimeline}))
assert.notEqual(originalMode.current.planning,firstCopy.planning)
console.log('PASS explicit original-video replication ignores legacy brand templates without changing original record')

// Saved-calendar likes are stored on the creative, not necessarily in BRAINSTORM_DECISION.
knowledge.marketingSolution.publishingCalendar.months['2026-10']=[{id:'saved-calendar-only',source:source('cre_calendar_only',90),creativeBrowserSelection:{policy:visibility.CREATIVE_SELECTION_POLICY,reason:'like'}}]
let matcherExclusions:string[]=[]
await api.refreshBrainstorm('user','brand',{action:'refresh',force:true},db,async(input:any)=>{matcherExclusions=input.excludeCreativeIds;assert.equal(input.market,undefined,'reference-video sources are not restricted to the brand location');return {contentMatchRequestId:'calendar-exclusion',creativeCandidates:[],contentLibraryGaps:[]}})
assert(matcherExclusions.includes('cre_calendar_only'),'already selected calendar sources must be excluded before matching, otherwise every refresh can return an empty visible feed')
console.log('PASS calendar-only selections excluded before matching')

// First screen resolves only the leading eight candidates. Full reads remain exhaustive.
db.$queryRaw=async()=>[]
rows=[{brandId:'brand',kind:contract.BRAINSTORM_FEED,period:'sources',version:1,createdAt:new Date(),input:{},output:{sources:Array.from({length:25},(_,i)=>source('cre_progressive_'+i,90))}}];knowledge={marketingSolution:{publishingCalendar:{months:{}}}}
const resolvedIds:string[][]=[],originalBrowse=clients.fetchBrainstormBrowse
clients.fetchBrandKeywords=async()=>({revision:1,tags:[]})
clients.fetchBrainstormBrowse=async(ids:string[],context:any)=>{resolvedIds.push(ids);return originalBrowse(ids,context)}
const preview=await api.listBrainstorm('user','brand',db,true)
assert.equal(preview.hasMore,true);assert.equal(preview.canDecide,false);assert.equal(preview.items.length,8);assert.equal(resolvedIds[0].length,8)
const complete=await api.listBrainstorm('user','brand',db)
assert.equal(complete.hasMore,false);assert.equal(complete.canDecide,true);assert.equal(complete.items.length,25);assert.equal(resolvedIds[1].length,25)
assert.deepEqual(preview.items.map((i:any)=>i.sourceId),complete.items.slice(0,8).map((i:any)=>i.sourceId))
console.log('PASS first-screen source bound, read-only partial feed, complete fallback and stable order')

// Incremental matching appends durably, replays receipts and never calls errors exhaustion.
rows=[];knowledge={marketingSolution:{publishingCalendar:{months:{}}}};db.$queryRaw=async()=>[];evidenceRevision='r1';evidenceTimeline=[]
let moreCalls=0,exclusions:any[]=[]
const moreMatch=async(input:any)=>{moreCalls++;exclusions.push(input.excludeCreativeIds);return {contentMatchRequestId:'more',creativeCandidates:[source('cre_more'+moreCalls,91)],contentLibraryGaps:[]}}
const firstMore={action:'loadMore',requestKey:'more-request-000001'}
const firstResult=await api.loadMoreBrainstorm('user','brand',firstMore,db,moreMatch)
assert.equal(firstResult.items[0].sourceId,'cre_more1');assert.equal(firstResult.exhausted,false)
assert.deepEqual(await api.loadMoreBrainstorm('user','brand',firstMore,db,moreMatch),firstResult);assert.equal(moreCalls,1)
await api.loadMoreBrainstorm('user','brand',{...firstMore,requestKey:'more-request-000002'},db,moreMatch)
assert(exclusions[1].includes('cre_more1'));assert.deepEqual((await api.listBrainstorm('user','brand',db)).items.map((i:any)=>i.sourceId),['cre_more1','cre_more2'])
const count=rows.length
await assert.rejects(api.loadMoreBrainstorm('user','brand',{...firstMore,requestKey:'more-request-000003'},db,async()=>({creativeCandidates:[],contentLibraryGaps:[{status:503}]})))
assert.equal(rows.length,count)
const end=await api.loadMoreBrainstorm('user','brand',{...firstMore,requestKey:'more-request-000004'},db,async()=>({contentMatchRequestId:'end',creativeCandidates:[],contentLibraryGaps:[]}))
assert.equal(end.exhausted,true);assert.deepEqual(end.items,[])
write=false;await assert.rejects(api.loadMoreBrainstorm('user','brand',firstMore,db,moreMatch));write=true
beforeTransaction=async()=>{await api.refreshBrainstorm('user','brand',{action:'refresh',force:true},db,async()=>({contentMatchRequestId:'replace',creativeCandidates:[],contentLibraryGaps:[]}))}
await assert.rejects(api.loadMoreBrainstorm('user','brand',{...firstMore,requestKey:'more-request-000005'},db,moreMatch),(e:any)=>e.code==='brainstorm_round_changed')
console.log('PASS incremental matching: durable append, source exclusions, idempotency, failure vs exhaustion, access and concurrent refresh')

// Cursor pages never repeat the full source lookup or load brand facts/tags.
rows=rows.filter(r=>r.kind!==contract.BRAINSTORM_FEED&&r.kind!==contract.BRAINSTORM_DECISION)
knowledge={marketingSolution:{publishingCalendar:{months:{}}}}
rows.push({kind:contract.BRAINSTORM_FEED,brandId:'brand',period:'sources',version:1,createdAt:new Date(),input:{},output:{sources:Array.from({length:25},(_,i)=>source('cre_page_'+i,90))}})
const findBrand=db.brand.findUnique;db.brand.findUnique=async()=>{throw Error('first screen must not read brand product facts')}
const pages:any[]=[];let cursor:string|undefined
for(let n=0;n<4;n++){const page=await api.listBrainstorm('user','brand',db,true,cursor,true);pages.push(page);cursor=page.nextCursor;assert.equal(page.matchingTagsUnavailable,true)}
assert.deepEqual(pages.map(p=>p.items.length),[8,8,8,1]);assert.equal(pages[3].hasMore,false);assert.equal(pages[3].canDecide,true)
assert.equal(new Set(pages.flatMap(p=>p.items.map((i:any)=>i.sourceId))).size,25)
await assert.rejects(api.listBrainstorm('user','brand',db,true,'cre_missing',true),(e:any)=>e.code==='brainstorm_cursor_changed')
db.brand.findUnique=findBrand
console.log('PASS bounded cursor pages, no duplicate sources, no brand facts/tag dependency, invalid cursor rejection')

// Saved calendar revisions may share a source; cursors address the exact card.
rows=[];knowledge={marketingSolution:{publishingCalendar:{months:{'2026-10':Array.from({length:10},(_,i)=>({id:'saved-'+i,title:'Saved '+i,source:source('cre_shared',90)}))}}}}
const calendarFirst=await api.listBrainstorm('user','brand',db,true,undefined,true)
assert.equal(calendarFirst.nextCursor,'saved:saved-7')
const calendarNext=await api.listBrainstorm('user','brand',db,true,calendarFirst.nextCursor,true)
assert.equal(calendarNext.items.length,2);assert.equal(calendarNext.hasMore,false)
console.log('PASS saved cards sharing a source retain exact cursor identity')

rows=[];knowledge={marketingSolution:{publishingCalendar:{months:{}}}}
let batchCalls=0
const batch=async(request:any)=>{batchCalls++;assert.equal(request.requestedCandidateCount,4);assert.equal(request.matchingTagId,"tag_food");return {contentMatchRequestId:"batch",creativeCandidates:[source("cre_batch_a",90),source("cre_batch_b",95)],contentLibraryGaps:[{status:503,reason:"other branch timeout"}]}}
const batchRequest={action:"loadMore",requestKey:"batch-request-000001",tagId:"tag_food"}
const batchResult=await api.loadMoreBrainstorm("user","brand",batchRequest,db,batch)
assert.equal(batchResult.items.length,2);assert.equal(batchResult.exhausted,false)
assert.deepEqual(await api.loadMoreBrainstorm("user","brand",batchRequest,db,batch),batchResult);assert.equal(batchCalls,1)
await assert.rejects(api.loadMoreBrainstorm("user","brand",{...batchRequest,requestKey:"batch-request-000002"},db,async()=>({creativeCandidates:[],contentLibraryGaps:[{status:503}]})),(e:any)=>e.code==="content_library_unavailable")
console.log("PASS partial failure retains validated batch, scoped tag, replay, and failed searches never exhaust")
