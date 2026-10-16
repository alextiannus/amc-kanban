import assert from 'node:assert/strict'
import {prisma as db} from '../src/lib/prisma.ts'
import {saveRecommendation} from '../src/lib/ai-native/recommendations.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {digest} from '../src/lib/ai-native/contract.ts'
import {readCreativeRevisions,saveCreativeRevision} from '../src/lib/brand-plan/creativeRevisions.ts'
import {catalogDigest,skuCatalog} from '../src/lib/brand-plan/creativeSkuContract.ts'
import {pinVideoEditor} from '../src/lib/videoLineage.ts'
import {scheduleCreative,unscheduleCreative,readCreativeScheduleAccounts} from '../src/lib/brand-plan/creativeScheduling.ts'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {canonicalCreativeSource} from '../src/lib/brand-plan/creativeSourceReference.ts'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/amc_lineage_test_[a-zA-Z0-9_]+$/.test(url.pathname))
const brandId='source-wave-brand',userId='source-wave-user',month='2026-12',actor={id:userId,type:'HUMAN'}
const shot={id:'shot-1',order:1,startSec:0,endSec:4,visualDescription:'Original',shotScale:'Close',cameraMovement:'Pan',subjectAction:'Show',voiceover:'',onScreenText:'',sound:'',narrativePurpose:'Hook',transition:'Cut'}
const source={inspirationCreativeId:'cre_source_wave',sourceRevision:'source-r1',sourceDigest:'d'.repeat(64),sourceEvidence:{scope:'full_source',originalText:'Complete original'},scriptContent:{kind:'video',originalText:'Complete original',timeline:[shot]},sourceVideo:{title:'Original video',platform:'instagram'},timeline:[shot]}
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External network disabled in provenance fixture')}
assert.equal(canonicalCreativeSource({...source,sourceDigest:undefined},source.inspirationCreativeId,'now'),null)
assert.throws(()=>canonicalCreativeSource(source,'cre_other','now'),/creative_source_changed/)
try{
 await db.auditLog.deleteMany({where:{metadata:{path:['brandId'],equals:brandId}}})
 await db.brand.deleteMany({where:{id:brandId}});await db.user.deleteMany({where:{id:userId}})
 await db.user.create({data:{id:userId,email:userId+'@example.invalid',password:'fixture',role:'ADMIN'}})
 await db.brand.create({data:{id:brandId,name:'Source fixture',crew:{create:{members:{create:{userId,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],menuItems:[{id:'sku-one',name:'Product'}],marketingSolution:{publishingCalendar:{months:{[month]:[]}}}}}}})
 const facts=await readBrandFacts(db,brandId),library:any={sources:[source],libraryDigest:'b'.repeat(64),contextDigest:digest(facts),retrievedAt:'2026-10-16T00:00:00Z',contentMatchRequestId:'match-fixture',gaps:[],libraryVersions:{}}
 const intent:any={kind:'creative_discovery',brandId,userId,skuWorkflow:true,goal:'Find source',requestKey:'discovery-wave',artifactPath:'work/source.json'}
 const content=JSON.stringify({kind:intent.kind,brandId,contextDigest:library.contextDigest,libraryDigest:library.libraryDigest,summary:'Source selection',recommendations:[{sourceCreativeId:source.inspirationCreativeId,title:'Product story',rationale:'Hook fits'}]})
 const artifact={path:intent.artifactPath,revision:1,digest:digest(content)}
 const discovery=await saveRecommendation(userId,brandId,'source-wave-task',intent,artifact,content,library,{sourceCreativeId:source.inspirationCreativeId,month,patch:{title:'Product story',planning:'Ignored draft',aiCaption:'',materialRequirements:[],platformTargets:['instagram']}})
 const id=discovery.creativeId
 assert.equal(discovery.receipt.content.source?.sourceDigest,source.sourceDigest,'discovery must persist per-source digest, not library batch digest')
 assert.equal(discovery.receipt.source.version,source.sourceRevision);assert.equal(discovery.receipt.source.evidence,'full_source')
 let state=await readCreativeRevisions(actor,brandId,month,id)
 const catalog=skuCatalog(await readBrandFacts(db,brandId)),evidence={...source,evidenceStatus:'full_source'}
 const confirmation={catalogDigest:catalogDigest(catalog),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest,selectedSkuIds:['sku-one'],recommendations:[{skuId:'sku-one',skuName:'Product',roles:['hero'],rationale:'Fits hook',sourceShotIds:[shot.id]}]}
 const confirmed=await saveCreativeRevision(actor,brandId,month,id,{expectedRevision:state.expectedRevision,idempotencyKey:'source-wave-confirm',patch:{}},db,undefined,undefined,{input:confirmation,source:evidence})
 const decision=confirmed.receipt.content.skuDecision
 const adopted=await saveCreativeRevision(actor,brandId,month,id,{expectedRevision:confirmed.receipt.contentHash,idempotencyKey:'source-wave-adopt',patch:{planning:'Adapted Product shot',materialRequirements:['Film Product']}},db,{taskId:'adapt-wave-task',agentId:'fixture',requestedBy:userId,contextDigest:digest(await readBrandFacts(db,brandId)),artifact,skuBinding:{brandId,creativeId:id,month,expectedRevision:confirmed.receipt.contentHash,catalogDigest:decision.catalogDigest,sourceRevision:decision.sourceRevision,sourceDigest:decision.sourceDigest,decisionDigest:decision.digest},skuSource:evidence})
 const copy=await saveCreativeRevision(actor,brandId,month,id,{expectedRevision:adopted.receipt.contentHash,idempotencyKey:'source-wave-copy',saveMode:'copy',patch:{planning:'Copy adapted Product shot'}},db)
 assert.deepEqual(adopted.receipt.content.source,confirmed.receipt.content.source,'adoption preserves the confirmed source snapshot')
 assert.deepEqual(copy.receipt.content.source,adopted.receipt.content.source,'copy preserves the adopted source snapshot')
 assert.equal(copy.receipt.content.source.contentMatchRequestId,'match-fixture')
 for(const receipt of [adopted.receipt,copy.receipt]){
  const pinned=await pinVideoEditor(db,brandId,{creativeId:receipt.content.id,creativeRevisionId:receipt.id,script:receipt.content.planning,assets:[]})
  assert.equal(pinned.sourceReference.sourceRevision,source.sourceRevision);assert.equal(pinned.sourceReference.sourceDigest,source.sourceDigest);assert.equal(pinned.sourceReference.libraryDigest,source.sourceDigest)
  assert.equal(pinned.lineageWarning,null);assert.equal(pinned.shotMappings[0].sourceShotId,shot.id);assert.deepEqual(pinned.shotMappings[0].selectedSkuIds,['sku-one'])
 }
 assert.equal((await readCreativeRevisions(actor,brandId,month,id,discovery.receipt.id)).revisions[0].source.version,source.sourceRevision)
 await db.socialAccount.createMany({data:['one','two'].map(key=>({id:'source-wave-'+key,brandId,platformId:'instagram',handle:'fixture-'+key,postfastAccountId:'fixture-'+key,connectionStatus:'CONNECTED'}))})
 const available=await readCreativeScheduleAccounts(actor,brandId,month,id)
 assert.equal(available.accounts.length,2);assert(!JSON.stringify(available).includes('postfastAccountId'))
 const scheduleBody={month,platform:'instagram',scheduledAt:'2099-12-20T02:00:00Z',idempotencyKey:'source-wave-schedule'}
 await assert.rejects(()=>scheduleCreative(actor,brandId,id,adopted.receipt.contentHash,scheduleBody),/schedule_account_ambiguous/)
 await db.socialAccount.update({where:{id:'source-wave-two'},data:{connectionStatus:'DISCONNECTED'}})
 await assert.rejects(()=>scheduleCreative(actor,brandId,id,adopted.receipt.contentHash,{...scheduleBody,accountId:'source-wave-two'}),/schedule_account_not_found/)
 const scheduled=await scheduleCreative(actor,brandId,id,adopted.receipt.contentHash,{...scheduleBody,accountId:'source-wave-one'})
 assert.equal(scheduled.schedule?.accountId,'source-wave-one')
 const revisionCount=await db.brandMarketingSolution.count({where:{brandId}})
 const cancelInput={month,idempotencyKey:'source-wave-cancel'}
 const canceled=await unscheduleCreative(actor,brandId,id,scheduled.expectedRevision,cancelInput)
 assert.equal(canceled.schedule,null);assert.equal((await unscheduleCreative(actor,brandId,id,scheduled.expectedRevision,cancelInput)).replayed,true)
 assert.equal((await readCreativeRevisions(actor,brandId,month,id)).current?.schedule,null)
 assert.equal((await db.contentDraft.findUniqueOrThrow({where:{id:scheduled.draftId!}})).scheduledAt,null)
 assert.equal(await db.brandMarketingSolution.count({where:{brandId}}),revisionCount)
 const rawId='source-wave-legacy',raw={id:rawId,title:'Legacy',planning:'Keep this script',date:'2026-12-01',platformTargets:['instagram'],schedule:null}
 const knowledge=await db.brandKnowledge.findUniqueOrThrow({where:{brandId}}),workspace=knowledge.marketingSolution as any
 workspace.publishingCalendar.months[month].push(raw)
 await db.brandKnowledge.update({where:{brandId},data:{marketingSolution:workspace}})
 const rawNote='Original merchant note brand-plan-calendar-item:'+rawId+' brand-plan-calendar-item:missing-creative'
 await db.contentDraft.create({data:{id:'source-wave-raw-draft',brandId,accountId:'source-wave-one',caption:'Original draft',agentNote:rawNote}})
 const rawInput={...scheduleBody,accountId:'source-wave-one',idempotencyKey:'source-wave-raw-ambiguous'}
 await assert.rejects(()=>scheduleCreative(actor,brandId,rawId,creativeDigest(raw),rawInput),/creative_schedule_draft_ambiguous/)
 assert.equal((await db.contentDraft.findUniqueOrThrow({where:{id:'source-wave-raw-draft'}})).agentNote,rawNote)
 await db.contentDraft.update({where:{id:'source-wave-raw-draft'},data:{agentNote:'Original merchant note brand-plan-calendar-item:'+rawId}})
 workspace.publishingCalendar.months['2027-01']=[{...raw,schedule:null}]
 await db.brandKnowledge.update({where:{brandId},data:{marketingSolution:workspace}})
 await assert.rejects(()=>scheduleCreative(actor,brandId,rawId,creativeDigest(raw),rawInput),/creative_schedule_draft_ambiguous/)
 assert.equal(await db.contentDraft.count({where:{brandId}}),2)
 console.log('PASS actual PostgreSQL multi-account selection, stale disconnected account, explicit cancel, retry and retained creative/history/draft')
 console.log('PASS actual PostgreSQL discovery -> confirmation -> adoption -> copy -> video pin; per-source revision/digest and immutable history')
}finally{globalThis.fetch=originalFetch;await db.auditLog.deleteMany({where:{metadata:{path:['brandId'],equals:brandId}}});await db.brand.deleteMany({where:{id:brandId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect()}
