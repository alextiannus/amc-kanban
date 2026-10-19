import {reuseIdeaDraft} from '../src/lib/ai-native/idea-content-draft'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {nativePool} from '../src/lib/ai-native/store'
import {initializeIdeaPool,refreshBrandIdeas} from '../src/lib/ai-native/idea-pool'
import {admitBrandIdeas} from '../src/lib/ai-native/idea-selection'
import {rankedIdeas,requiredIdeaCount,unfinishedDraft} from '../src/lib/ai-native/idea-selection-policy'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const pool=nativePool(),brandId=`selection-${randomUUID()}`,userId=`selection-user-${randomUUID()}`,now=new Date('2026-10-18T18:00:00Z')
const authorize=async()=>{},admit=(id?:string)=>admitBrandIdeas(userId,brandId,id,prisma,authorize,now)
assert.deepEqual(rankedIdeas([{id:'a',source:{matchScore:12}},{id:'unknown'},{id:'b',source:{matchScore:98}}]).map(i=>i.id),['b','a','unknown'])
assert.equal(requiredIdeaCount(null),0)
assert.equal(requiredIdeaCount({platforms:{instagram:{postsPerMonth:2}}}),2)
assert(unfinishedDraft({status:'failed'}));assert(!unfinishedDraft({status:'published'}))
let ids:string[]=[]
try{
 await initializeIdeaPool(pool)
 await prisma.user.create({data:{id:userId,email:`${userId}@example.test`,type:'HUMAN',status:'ACTIVE',role:'ADMIN',password:'test-only-not-a-credential'}})
 await prisma.brand.create({data:{id:brandId,name:'TEST ONLY ranked ideas',timezone:'Asia/Singapore'}})
 await prisma.brandKnowledge.create({data:{brandId,negPrompts:[],marketingSolution:{}}})
 // Matching itself must create neither a calendar draft nor a localized script.
 const source=(n:number)=>({inspirationCreativeId:`cre_selection_${n}`,matchScore:n,creativeDirection:['process','product','tasting','education','comparison','brand_story','occasion','offer'][n%8],sourceRevision:'r1',sourceDigest:'a'.repeat(64),sourceVideo:{title:randomUUID()+randomUUID()},sourceEvidence:{scope:'full_source'},scriptContent:{kind:'video',body:`Original script ${n}`},timeline:[{narrativePurpose:'Original scene'}]})
 await refreshBrandIdeas(pool,{id:brandId,name:'TEST ONLY',timezone:'Asia/Singapore',knowledge:{}},async()=>({creativeCandidates:[source(98),source(80),source(70)],contentLibraryGaps:[]}) as any,now)
 assert.equal(await prisma.contentDraft.count({where:{brandId}}),0)
 const rows=(await pool.query("SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 ORDER BY (source->>'matchScore')::numeric DESC",[brandId])).rows;ids=rows.map(r=>r.id)
 assert.equal(ids.length,3)
 await pool.query('UPDATE amc_iaic.brand_ideas SET selected_at=now() WHERE brand_id=$1',[brandId])
 assert.equal((await admit()).reason,'publishing_quantity_not_configured')
 await prisma.brandKnowledge.update({where:{brandId},data:{publishingFreq:{platforms:{instagram:{postsPerMonth:2}}}}})
 const calls=await Promise.all(Array.from({length:5},()=>admit()))
 assert.equal(calls.flatMap(c=>c.selected).length,1,'replicas only fill empty calendar once')
 let drafts=await prisma.contentDraft.findMany({where:{brandId}})
 assert.equal(drafts.length,1);assert(drafts.every(d=>d.status==='planned_unimplemented'&&d.scheduledAt===null&&d.mediaUrls.length===0))
 assert.equal((await admit()).reason,'calendar_not_empty')
 const saved:any=await prisma.brandKnowledge.findUnique({where:{brandId}})
 const items=saved.marketingSolution.publishingCalendar.months['2026-10']
 assert.deepEqual(items.map((i:any)=>i.inspirationCreativeId),['cre_selection_98'])
 assert(items.every((i:any)=>i.planning===''&&i.schedule===null&&i.aiCaption===''&&i.calendarSelection.draftId))
 // Like is an independent explicit trigger, even with existing drafts; replay is safe.
 const liked=await Promise.all(Array.from({length:5},()=>admit(ids[2])))
 assert.equal(liked.filter(c=>!c.selected[0].replayed).length,1)
 assert.equal(await prisma.contentDraft.count({where:{brandId}}),2)
 const authorizedReplay=await admitBrandIdeas(userId,brandId,ids[2]);assert(authorizedReplay.selected[0].replayed,'real Admin authorization must preserve the same receipt')
 await assert.rejects(()=>admitBrandIdeas(userId,'foreign-brand',ids[0],prisma,async()=>{throw new Error('denied')},now),/denied/)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:'CREATIVE_ITEM'}}),0,'selection creates no adapted revision')
 // Production saves into the SAME undated placeholder, without a second draft.
 const produced=await prisma.$transaction(tx=>reuseIdeaDraft(tx,brandId,items[0],'generation-test',{caption:'Verified generated content',mediaUrls:[],hashtags:[]}))
 assert.equal(produced,items[0].calendarSelection.draftId)
 assert.equal(await prisma.contentDraft.count({where:{brandId}}),2)
 const same=await prisma.$transaction(tx=>reuseIdeaDraft(tx,brandId,items[0],'generation-test',{caption:'Duplicate result',mediaUrls:[],hashtags:[]}));assert.equal(same,produced)
 assert.equal((await prisma.contentDraft.findUniqueOrThrow({where:{id:produced!}})).caption,'Verified generated content')
 await assert.rejects(()=>prisma.$transaction(tx=>reuseIdeaDraft(tx,brandId,items[0],'other-generation',{caption:'Must not overwrite'})),/selected_idea_draft_changed/)
 // Publishing history does not refill a fulfilled monthly target.
 await prisma.contentDraft.updateMany({where:{brandId},data:{status:'published',publishedAt:now}})
 assert.equal((await admit()).selected.length,0)
 console.log('PASS: source-only matching, rank, quantity, empty calendar, concurrent Like, replay, undated drafts, no adaptation or production')
}finally{
 await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[brandId]);await pool.query('DELETE FROM amc_iaic.brand_idea_days WHERE brand_id=$1',[brandId])
 await prisma.auditLog.deleteMany({where:{actorId:userId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}});await prisma.$disconnect();await pool.end()
}
