import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {nativePool} from '../src/lib/ai-native/store.ts'
import {initializeIdeaPool,refreshBrandIdeas,brandDay,selectPoolIdea,poolIdeaLibrary} from '../src/lib/ai-native/idea-pool.ts'
import {brandLibrary} from '../src/lib/ai-native/library.ts'
import {DIRECTIONS} from '../src/lib/ai-native/creative-diversity.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const pool=nativePool(),brandId=`pool-test-${randomUUID()}`,facts={id:brandId,name:'Test brand',timezone:'Asia/Singapore',knowledge:{},productCatalog:[]}
let calls=0,index=0
const match=async(input:any)=>{calls++;assert(input.requirePersistedCreative);assert.equal(input.minimumMatchScore,75);assert.equal(input.market,undefined);const active=(await pool.query('SELECT source FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL',[brandId])).rows;const counts:any={};for(const row of active)counts[row.source.creativeDirection]=(counts[row.source.creativeDirection]||0)+1;const directions=[...DIRECTIONS].sort((a,b)=>(counts[a]||0)-(counts[b]||0));return {contentMatchRequestId:'match-test',creativeCandidates:Array.from({length:input.requestedCandidateCount},(_,n)=>({inspirationCreativeId:`cre_ins_${brandId}_${index++}`,matchScore:90,sourceRevision:'r1',sourceDigest:'a'.repeat(64),sourceEvidence:{scope:'full_source',timeline:[{id:'shot1',visualDescription:'Actual source'}]},creativeDirection:directions[n%directions.length],sourceVideo:{videoUrl:'https://fixture.example/video.mp4',title:randomUUID()+randomUUID()},assetNeeds:['Product close-up, vertical, 5 seconds'],scriptContent:{title:'Product story',body:'Show product and invite a visit'}})),libraryVersions:{},contentLibraryGaps:[]}}
const day=(n:number)=>new Date(`2099-10-${String(n).padStart(2,'0')}T10:00:00Z`)
const rows=async()=>(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1 AND replaced_at IS NULL ORDER BY created_at,id',[brandId])).rows
try{
 await initializeIdeaPool(pool)
 assert.equal(brandDay('Asia/Singapore',new Date('2099-10-01T17:00:00Z')),'2099-10-02')
 await Promise.all(Array.from({length:8},()=>refreshBrandIdeas(pool,facts,match as any,day(1))))
 assert.equal(calls,1,'replicas must share the daily admission');assert.equal((await rows()).length,8)
 for(let n=2;n<=5;n++)await refreshBrandIdeas(pool,facts,match as any,day(n))
 assert.equal((await rows()).length,18)
 const original=(await rows())[0];await selectPoolIdea(brandId,original.id)
 const bound=await brandLibrary({kind:'creative_discovery',poolIdeaId:original.id,brandId,userId:'fixture',goal:'Adapt selected source',requestKey:'pool-test-request',artifactPath:'work/test.json'},facts)
 assert.equal(bound.sources.length,1);assert.equal(bound.sources[0].inspirationCreativeId,original.source_id)
 await assert.rejects(()=>selectPoolIdea('other-brand',original.id),/idea_not_found/)
 await assert.rejects(()=>poolIdeaLibrary('other-brand',original.id,facts),/idea_not_found/)
 await refreshBrandIdeas(pool,facts,match as any,day(6));assert.equal((await rows()).filter(row=>!row.selected_at).length,18)
 assert((await rows()).some(row=>row.id===original.id),'prefer replacing unselected suggestions')
 await pool.query('UPDATE amc_iaic.brand_ideas SET selected_at=now() WHERE brand_id=$1',[brandId])
 await refreshBrandIdeas(pool,facts,match as any,day(7));assert.equal((await rows()).filter(row=>!row.selected_at).length,8,'selected history must not consume the daily suggestion capacity')
 assert.deepEqual((await pool.query('SELECT source FROM amc_iaic.brand_ideas WHERE id=$1',[original.id])).rows[0].source,original.source,'replacement must retain immutable evidence for admitted tasks and plans')
 const before=(await rows()).map(row=>row.id).sort()
 let failCalls=0;const failing=async()=>{failCalls++;throw new Error('offline')}
 await assert.rejects(()=>refreshBrandIdeas(pool,facts,failing as any,day(8)))
 await refreshBrandIdeas(pool,facts,failing as any,day(8));assert.equal(failCalls,1)
 assert.deepEqual((await rows()).map(row=>row.id).sort(),before,'failure retains existing pool')
 for(const minutes of [16,32])await assert.rejects(()=>refreshBrandIdeas(pool,facts,failing as any,new Date(day(8).getTime()+minutes*60000)))
 await refreshBrandIdeas(pool,facts,failing as any,new Date(day(8).getTime()+48*60000));assert.equal(failCalls,3,'recovery is capped at three attempts per local day')
 await refreshBrandIdeas(pool,facts,async()=>({creativeCandidates:[],contentLibraryGaps:[]}) as any,day(9))
 assert.deepEqual((await rows()).map(row=>row.id).sort(),before,'no matches must not evict existing ideas')
 const duplicate=before[0],source=(await rows()).find(row=>row.id===duplicate).source
 await refreshBrandIdeas(pool,facts,async()=>({creativeCandidates:[source,source],contentLibraryGaps:[]}) as any,day(10))
 assert.deepEqual((await rows()).map(row=>row.id).sort(),before,'duplicate content results never replace a valid pool item')
 // A restarted lease owner must not admit the old process's late response.
 let release!:()=>void,entered!:()=>void
 const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve)
 const old=refreshBrandIdeas(pool,facts,async(input:any)=>{entered();await gate;return match(input)},day(11))
 await started
 await refreshBrandIdeas(pool,facts,match as any,new Date(day(11).getTime()+16*60000))
 const afterRecovery=(await rows()).map(row=>row.id).sort()
 release();assert.equal((await old).skipped,true)
 assert.deepEqual((await rows()).map(row=>row.id).sort(),afterRecovery,'stale owner cannot write late results')
 await refreshBrandIdeas(pool,facts,async()=>({creativeCandidates:[{inspirationCreativeId:'cre_low',matchScore:75,sourceRevision:'r',sourceDigest:'a'.repeat(64),sourceVideo:{videoUrl:'https://fixture.example/v.mp4'}}],contentLibraryGaps:[]}) as any,day(12))
 assert.deepEqual((await rows()).map(row=>row.id).sort(),afterRecovery,'unqualified candidates never enter nightly browser pool')
 console.log('PASS: brand timezone, 8-way daily claim, 8→18 growth, bounded replacement, selected source retention, outage/no-match/duplicate preservation')
}finally{await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[brandId]);await pool.query('DELETE FROM amc_iaic.brand_idea_days WHERE brand_id=$1',[brandId]);await pool.end();if((globalThis as any).amcIdeaPool)await (await (globalThis as any).amcIdeaPool).end();await prisma.$disconnect()}
