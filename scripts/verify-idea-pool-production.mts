import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {prisma} from '../src/lib/prisma.ts'
import {initializeIdeaPool,refreshBrandIdeas,readIdeaPool,poolIdeaLibrary} from '../src/lib/ai-native/idea-pool.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {createNativeTask,readNativeTask,adoptNativeCandidate,getNativeHost} from '../src/lib/ai-native/service.ts'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'))
const [phase,id]=process.argv.slice(2);assert(['run','inspect','cleanup'].includes(phase)&&/^amc-pool-acceptance-[a-z0-9-]+$/.test(id))
let host:Awaited<ReturnType<typeof getNativeHost>>|undefined
try{
 host=await getNativeHost();assert((await host.app.runtime.drain({timeoutMs:5000})).drained);await initializeIdeaPool(host.pool)
 if(phase==='run'){
  assert(!await prisma.user.findUnique({where:{id}}),'Inspect existing fixture instead of repeating work')
  await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  await prisma.brand.create({data:{id,name:'Noodle Studio pool acceptance',description:'Synthetic restaurant in Singapore serving Sesame Noodles. Proposed brand-owned product footage. Concise English. No discounts, health claims or availability are confirmed. Prepare a proposed 15-second script. Do not generate content or publish.',industry:'restaurant',status:'ARCHIVED',autoPilot:false,timezone:'Asia/Singapore',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{brandTone:'Concise factual English',menuItems:[{id:'sku_sesame',name:'Sesame Noodles',description:'Noodles with sesame sauce',price:'8.50',currency:'SGD'}]}}}})
 }
 const fixture=await prisma.brand.findUniqueOrThrow({where:{id}});assert.equal(fixture.name,'Noodle Studio pool acceptance');assert.equal(fixture.status,'ARCHIVED')
 const facts=await readBrandFacts(prisma,id)
 if(phase==='run'){
  const daily=(await host.pool.query("SELECT d.status,count(i.id)::int AS count FROM (SELECT DISTINCT ON (brand_id) brand_id,status FROM amc_iaic.brand_idea_days WHERE brand_id NOT LIKE 'amc-pool-acceptance-%' ORDER BY brand_id,local_day DESC) d LEFT JOIN amc_iaic.brand_ideas i ON i.brand_id=d.brand_id AND i.replaced_at IS NULL GROUP BY d.brand_id,d.status")).rows
  console.log(JSON.stringify({phase:'resident-daily-worker',brands:daily.length,underTarget:daily.filter(row=>row.count<6).length,maximumIdeas:Math.max(0,...daily.map(row=>row.count)),states:daily.reduce((counts,row)=>({...counts,[row.status]:(counts[row.status]||0)+1}),{})}))
  await refreshBrandIdeas(host.pool,facts)
  assert.equal((await refreshBrandIdeas(host.pool,facts)).skipped,true)
  const pool=await readIdeaPool(id,id);assert(pool.items.length>0&&pool.items.length<=6)
  await assert.rejects(()=>readIdeaPool(id,'not-this-brand'))
  const input={kind:'creative_discovery',poolIdeaId:pool.items[0].id}
  const task=await createNativeTask(id,id,input),again=await createNativeTask(id,id,input);assert.equal(task.id,again.id)
  const bound=await poolIdeaLibrary(id,input.poolIdeaId,facts);assert.equal(bound.sources.length,1);assert.equal(bound.sources[0].inspirationCreativeId,pool.items[0].source_id)
  await assert.rejects(()=>poolIdeaLibrary('not-this-brand',input.poolIdeaId,facts))
  let result=await readNativeTask(id,id,task.id)
  const end=Date.now()+230000;while(['queued','running'].includes(result.status)&&Date.now()<end){await delay(1500);result=await readNativeTask(id,id,task.id)}
  console.log(JSON.stringify({phase:'task',taskId:task.id,status:result.status,waitingReason:result.waitingReason,usage:result.usage,poolSize:pool.items.length}))
  assert.equal(result.status,'succeeded');assert(result.artifact&&result.recommendations&&result.usage.complete)
  const candidate=result.recommendations.recommendations[0];assert(candidate);assert.equal(candidate.sourceCreativeId,pool.items[0].source_id);assert.deepEqual(candidate.skuIds,['sku_sesame']);assert(candidate.materialRequirements.length);assert.match(candidate.planning,/Sesame Noodles/)
  const {title,planning,aiCaption,materialRequirements}=candidate
  const body={requestKey:'pool-review-save-v1',artifactDigest:result.artifact.digest,sourceCreativeId:candidate.sourceCreativeId,patch:{title,planning:planning+'\nHuman review: use brand-owned footage.',aiCaption,materialRequirements,date:'2099-11-17',platform:'instagram'}}
  const saved=await adoptNativeCandidate(id,id,task.id,body),replayed=await adoptNativeCandidate(id,id,task.id,body);assert.equal(saved.receipt.id,replayed.receipt.id)
  assert.equal(saved.receipt.actor.id,id);assert.equal(saved.receipt.principals[0].userId,id);assert.equal(saved.receipt.source.creativeId,candidate.sourceCreativeId);assert.equal(saved.receipt.ai.taskId,task.id)
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  console.log(JSON.stringify({ok:true,poolSize:pool.items.length,shortfall:pool.shortfall,taskId:task.id,receiptId:saved.receipt.id,materialCount:materialRequirements.length,skuIds:candidate.skuIds,noPublication:true}))
 }else{
  const requests=(await host.pool.query('SELECT task_id FROM amc_ai_requests WHERE subject_id=$1 ORDER BY created_at DESC',[id])).rows
  const tasks=await Promise.all(requests.filter(row=>row.task_id).map(row=>readNativeTask(id,id,row.task_id)))
  if(phase==='inspect')console.log(JSON.stringify({pool:await readIdeaPool(id,id),tasks}))
  else{assert(tasks.every(task=>!['queued','running','waiting'].includes(task.status)&&task.usage.complete));assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0);await host.pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[id]);await host.pool.query('DELETE FROM amc_iaic.brand_idea_days WHERE brand_id=$1',[id]);await prisma.brand.delete({where:{id}});await prisma.user.delete({where:{id}});console.log(JSON.stringify({ok:true,fixtureCleaned:true,retained:['Core task','ledger','artifact','audit']}))}
 }
}finally{if(host){const d=await host.app.runtime.drain({timeoutMs:5000});if(d.drained)await host.pool.end()}await prisma.$disconnect()}
