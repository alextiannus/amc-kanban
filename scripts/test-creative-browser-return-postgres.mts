import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {nativePool} from '../src/lib/ai-native/store'
import {initializeIdeaPool} from '../src/lib/ai-native/idea-pool'
import {listBrainstorm,decideSavedBrainstorm,decideBrainstorm} from '../src/lib/ai-native/brainstorm'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract'
import {calendarCreativeOption} from '../src/lib/brand-plan/calendarSync'
import {creativeDraftMarker} from '../src/lib/brand-plan/creativeDraftMarker'
import {returnedCreativePlaceholderFilters} from '../src/lib/brand-plan/creativeVisibility'
import {admitBrandIdeas} from '../src/lib/ai-native/idea-selection'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const id=randomUUID(),brandId='browser-'+id,userId='browser-'+id,pool=nativePool()
const source=(id:string,score=94)=>({inspirationCreativeId:id,sourceRevision:'r1',sourceDigest:'a'.repeat(64),matchScore:score,sourceVideo:{title:'Original '+id},sourceEvidence:{scope:'full_source',originalText:'Original script'},scriptContent:{kind:'video'}})
let old:any={id:'legacy',title:'Saved creative',planning:'Preserve exact saved brand script',inspirationCreativeId:'cre_legacy',source:{inspirationCreativeId:'cre_legacy',sourceRevision:'r1',sourceDigest:'a'.repeat(64)},nativeSourceSnapshot:{source:source('cre_legacy')},calendarSelection:{draftId:'placeholder',reason:'empty_calendar'},schedule:{draftId:'real-schedule'}}
const noSource={id:'manual-old',title:'Historical manual idea',planning:'Keep manual script'},oldLiked={...old,id:'old-liked',inspirationCreativeId:'cre_liked',source:{...old.source,inspirationCreativeId:'cre_liked'},nativeSourceSnapshot:{source:source('cre_liked')},brainstorm:{likedBy:userId,likedAt:'2026-10-18',sourceId:'cre_liked'}}
try{
 await initializeIdeaPool(pool)
 await prisma.user.create({data:{id:userId,email:userId+'@example.test',type:'HUMAN',status:'ACTIVE',role:'ADMIN',password:'test-only-not-a-credential'}})
 await prisma.brand.create({data:{id:brandId,name:'TEST ONLY browser return'}})
 const placeholder=await prisma.contentDraft.create({data:{brandId,caption:'内容创意：Saved creative',mediaUrls:[],hashtags:[],status:'planned_unimplemented',agentNote:creativeDraftMarker('unscheduled',old.id)}})
 const real=await prisma.contentDraft.create({data:{brandId,caption:'Keep actual content',mediaUrls:['https://example.test/owned.mp4'],hashtags:[],status:'scheduled',scheduledAt:new Date('2026-11-20')}})
 old.calendarSelection.draftId=placeholder.id;old.schedule.draftId=real.id
 const workspace:any={publishingCalendar:{months:{'2026-10':[old,noSource,oldLiked,{id:'native-only',title:'Native source-only history',nativeSourceSnapshot:{source:source('cre_native_only',95)}}]}}}
 await prisma.brandKnowledge.create({data:{brandId,negPrompts:[],marketingSolution:workspace}})
 const poolId=randomUUID(),newPoolId=randomUUID()
 await pool.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions,plan_id,plan_month,selected_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()),($10,$2,$11,$12,$5,$6,$7,null,null,null)',[poolId,brandId,'cre_legacy',JSON.stringify(source('cre_legacy')),'context','match','{}',old.id,'2026-10',newPoolId,'cre_inbox',JSON.stringify(source('cre_inbox',82))])
 await pool.query("UPDATE amc_iaic.brand_ideas SET match_id='' WHERE id=$1",[newPoolId])
 await prisma.brandMarketingSolution.create({data:{brandId,kind:'BRAINSTORM_FEED',period:'sources',version:1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{contentMatchRequestId:'unrelated-batch'},output:{sources:[]}}})
 await prisma.brandMarketingSolution.create({data:{brandId,kind:'BRAINSTORM_DECISION',period:'cre_liked',version:1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:'like',sourceDigest:'a'.repeat(64)},output:{creativeId:oldLiked.id,month:'2026-10'}}})
 await assert.rejects(decideBrainstorm(userId,brandId,{action:'decide',sourceId:'cre_liked',sourceDigest:'a'.repeat(64),decision:'like',expectedVersion:0}),(e:any)=>e.code==='brainstorm_decision_changed')
 let feed=await listBrainstorm(userId,brandId)
 assert.equal(feed.items.length,5);assert(feed.items.some(i=>i.poolIdeaId===newPoolId));assert(feed.items.some(i=>i.savedCreativeId===oldLiked.id));assert.equal(feed.items.find(i=>i.savedCreativeId===noSource.id).matchScore,null);assert.equal(feed.items.find(i=>i.savedCreativeId===noSource.id).sourceDigest,null)
 assert.equal(calendarCreativeOption(old),null);assert.equal(calendarCreativeOption(oldLiked),null)
 const filters=returnedCreativePlaceholderFilters(workspace)
 assert.equal((await prisma.contentDraft.findMany({where:{brandId,NOT:{OR:filters}}})).length,1)
 assert.equal((await prisma.contentDraft.findMany({where:{brandId}})).length,2)
 assert.equal((await admitBrandIdeas(userId,brandId,undefined,prisma,async()=>{})).selected.length,0)
 // Fresh choice is serialized and idempotent; no script, draft, revision or task is created.
 const choice={action:'decideSaved',creativeId:old.id,expectedRevision:creativeDigest(old),decision:'like'}
 const replies=await Promise.all(Array.from({length:4},()=>decideSavedBrainstorm(userId,brandId,choice)))
 assert.equal(replies.filter(r=>!r.replayed).length,1)
 let knowledge:any=await prisma.brandKnowledge.findUnique({where:{brandId}}),current=knowledge.marketingSolution.publishingCalendar.months['2026-10'][0]
 assert(calendarCreativeOption(current));assert.equal(current.planning,old.planning);assert.deepEqual(current.source,old.source);assert.deepEqual(current.schedule,old.schedule)
 assert.equal((await listBrainstorm(userId,brandId)).items.length,4)
 assert.equal(await prisma.contentDraft.count({where:{brandId}}),2);assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:'CREATIVE_REVISION'}}),0)
 await assert.rejects(decideSavedBrainstorm(userId,brandId,{...choice,decision:'defer'}),(e:any)=>e.code==='creative_revision_conflict')
 const manual=feed.items.find(i=>i.savedCreativeId===noSource.id)
 const deferred=await decideSavedBrainstorm(userId,brandId,{action:'decideSaved',creativeId:noSource.id,expectedRevision:manual.expectedRevision,decision:'defer'})
 assert.equal((await listBrainstorm(userId,brandId)).items.find(i=>i.savedCreativeId===noSource.id).decision,'defer')
 await decideSavedBrainstorm(userId,brandId,{action:'decideSaved',creativeId:noSource.id,expectedRevision:deferred.expectedRevision,decision:'like'})
 // Pool originals from inbox are chosen through the same source-only contract.
 await decideBrainstorm(userId,brandId,{action:'decide',poolIdeaId:newPoolId,sourceId:'cre_inbox',sourceDigest:'a'.repeat(64),expectedVersion:0,decision:'defer'})
 await pool.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE id=$1',[newPoolId])
 assert.equal((await listBrainstorm(userId,brandId)).items.find(i=>i.poolIdeaId===newPoolId).decision,'defer')
 await decideBrainstorm(userId,brandId,{action:'decide',poolIdeaId:newPoolId,sourceId:'cre_inbox',sourceDigest:'a'.repeat(64),expectedVersion:1,decision:'like'})
 knowledge=await prisma.brandKnowledge.findUnique({where:{brandId}})
 const picked:any=Object.values(knowledge.marketingSolution.publishingCalendar.months).flat().find((i:any)=>i.inspirationCreativeId==='cre_inbox');assert.equal(picked.nativeSourceSnapshot.contentMatchRequestId,null);assert.equal(picked.source.contentMatchRequestId,null)
 assert.equal(Object.values(knowledge.marketingSolution.publishingCalendar.months).flat().filter((i:any)=>calendarCreativeOption(i)).length,3)
 assert.equal((await prisma.contentDraft.findUniqueOrThrow({where:{id:real.id}})).status,'scheduled')
 assert.equal(await prisma.auditLog.count({where:{actorId:userId,action:'RETURNED_CREATIVE_DECISION_SAVED'}}),3)
 // Even new >=90 sources must wait for Like; no score authorizes automatic work.
 await prisma.contentDraft.update({where:{id:real.id},data:{status:'archived'}});await prisma.contentDraft.update({where:{id:placeholder.id},data:{status:'archived'}})
 await pool.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),brandId,'cre_auto',JSON.stringify(source('cre_auto',93)),'context','match','{}'])
 await pool.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),brandId,'cre_native_only',JSON.stringify(source('cre_native_only',95)),'context','match','{}'])
 await prisma.brandKnowledge.update({where:{brandId},data:{publishingFreq:{platforms:{instagram:{postsPerMonth:4}}}}})
 const automatic=await admitBrandIdeas(userId,brandId,undefined,prisma,async()=>{})
 assert.equal(automatic.selected.length,0);assert.equal(automatic.reason,'human_choice_required');assert((await listBrainstorm(userId,brandId)).items.some(i=>i.sourceId==='cre_auto'))
 console.log('PASS real PostgreSQL: legacy/old likes return without deleting data; fresh concurrent Like reuses records, defer durable, inbox pool Like unified, no rewrite, real schedules retained, >=90 sources also require Like')
}finally{
 await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[brandId]);await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.contentDraft.deleteMany({where:{brandId}});await prisma.brandMarketingSolution.deleteMany({where:{brandId}});await prisma.brandKnowledge.deleteMany({where:{brandId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}});await pool.end();await prisma.$disconnect()
}
