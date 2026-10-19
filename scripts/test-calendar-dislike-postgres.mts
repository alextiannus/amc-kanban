import assert from 'node:assert/strict'
import {creativeDraftMarker} from '../src/lib/brand-plan/creativeDraftMarker'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {nativePool} from '../src/lib/ai-native/store'
import {readBrandFacts} from '../src/lib/ai-native/facts'
import {dismissCalendarCreative,listBrainstorm} from '../src/lib/ai-native/brainstorm'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract'
import {listOpenCalendarCreativeOptions} from '../src/lib/brand-plan/calendarSync'
import {initializeIdeaPool,readIdeaPool} from '../src/lib/ai-native/idea-pool'
import {admitBrandIdeas} from '../src/lib/ai-native/idea-selection'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const brandId='dislike-'+randomUUID(),userId='dislike-'+randomUUID(),ideaId=randomUUID(),pool=nativePool()
const sourceId='cre_dislike_test',source={inspirationCreativeId:sourceId,sourceRevision:'r1',sourceDigest:'a'.repeat(64),matchScore:94,sourceVideo:{title:'Original reference'},sourceEvidence:{scope:'full_source',originalText:'Original script'},scriptContent:{kind:'video'}}
const item={id:'saved-idea',title:'Selected idea',planning:'Keep this saved script',schedule:{draftId:'saved-draft'},inspirationCreativeId:sourceId,nativeSourceSnapshot:{source},source:{inspirationCreativeId:sourceId,sourceRevision:'r1',sourceDigest:'a'.repeat(64)}}
try{
 await initializeIdeaPool(pool)
 await prisma.user.create({data:{id:userId,email:userId+'@example.test',type:'HUMAN',status:'ACTIVE',role:'ADMIN',password:'test-only-not-a-credential'}})
 await prisma.brand.create({data:{id:brandId,name:'TEST ONLY calendar dislike'}})
 await prisma.brandKnowledge.create({data:{brandId,negPrompts:[],marketingSolution:{publishingCalendar:{months:{'2026-10':[item],'2026-09':[{...item,id:'other-version'}]}}}}})
 const placeholder=await prisma.contentDraft.create({data:{brandId,caption:'内容创意：Selected idea',mediaUrls:[],hashtags:[],status:'planned_unimplemented',agentNote:creativeDraftMarker('unscheduled','other-version')}})
 const knowledgeBefore:any=await prisma.brandKnowledge.findUnique({where:{brandId}});knowledgeBefore.marketingSolution.publishingCalendar.months['2026-09'][0].calendarSelection={draftId:placeholder.id}
 await prisma.brandKnowledge.update({where:{brandId},data:{marketingSolution:knowledgeBefore.marketingSolution}})
 const draft=await prisma.contentDraft.create({data:{brandId,caption:'Keep actual content',mediaUrls:['https://example.test/owned.mp4'],hashtags:[],status:'draft'}})
 await prisma.brandMarketingSolution.create({data:{brandId,kind:'BRAINSTORM_FEED',period:'sources',version:1,status:'READY',generationMode:'SOURCE_MATCH',createdById:userId,input:{},output:{sources:[source]}}})
 await pool.query('INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions,plan_id,plan_month) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[ideaId,brandId,sourceId,JSON.stringify(source),'context','match','{}',item.id,'2026-10'])
 assert.equal((await listBrainstorm(userId,brandId)).items.length,2)
 await prisma.brandMarketingSolution.create({data:{brandId,kind:'BRAINSTORM_DECISION',period:'cre_previous_browsing_choice',version:1,status:'SAVED',generationMode:'HUMAN_CHOICE',createdById:userId,input:{decision:'dislike'},output:{}}})
 const beforeFacts=await readBrandFacts(prisma,brandId);assert(beforeFacts.dislikedSourceIds.includes('cre_previous_browsing_choice'))
 const body={action:'dismiss',creativeId:item.id,expectedRevision:creativeDigest(item)}
 const results=await Promise.all(Array.from({length:4},()=>dismissCalendarCreative(userId,brandId,body)))
 assert.equal(results.filter(r=>!r.replayed).length,1)
 const knowledge:any=await prisma.brandKnowledge.findUnique({where:{brandId}}),saved=knowledge.marketingSolution.publishingCalendar.months['2026-10'][0]
 assert.equal(saved.planning,item.planning);assert.deepEqual(saved.source,item.source);assert.deepEqual(saved.schedule,item.schedule)
 assert.equal((await listOpenCalendarCreativeOptions(brandId,'2026-10')).length,0)
 assert.equal((await listOpenCalendarCreativeOptions(brandId,'2026-09')).length,0)
 assert.equal((await listBrainstorm(userId,brandId)).items.length,0)
 assert.equal((await readIdeaPool(userId,brandId)).items.length,0)
 await assert.rejects(admitBrandIdeas(userId,brandId,ideaId),(e:any)=>e.code==='idea_not_found')
 assert.equal((await prisma.contentDraft.findUnique({where:{id:draft.id}}))?.caption,'Keep actual content')
 const archived=await prisma.contentDraft.findUnique({where:{id:placeholder.id}});assert.equal(archived?.status,'archived');assert.equal(archived?.caption,placeholder.caption);assert.equal(archived?.agentNote,placeholder.agentNote);assert(results.every(r=>r.hiddenDraftIds.includes(placeholder.id)))
 assert.equal(await prisma.auditLog.count({where:{resourceId:item.id,action:'CALENDAR_CREATIVE_DISLIKED'}}),1)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:'BRAINSTORM_FEED'}}),1)
 console.log('PASS real PostgreSQL: concurrent dislike replays once, both calendar versions and recommendation routes hide the source; source/script/schedule/draft/history remain intact; cannot re-admit disliked source')
}finally{
 await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[brandId]);await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.contentDraft.deleteMany({where:{brandId}});await prisma.brandMarketingSolution.deleteMany({where:{brandId}});await prisma.brandKnowledge.deleteMany({where:{brandId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}});await pool.end();await (await (globalThis as any).amcIdeaPool)?.end();(globalThis as any).amcIdeaPool=undefined;await prisma.$disconnect()
}
