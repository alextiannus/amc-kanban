// Bounded pre-release acceptance: actual configured model and Growth, isolated Core schema.
// Brand facts are read-only. No content generation, scheduling, publication or role changes.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {prisma} from '../src/lib/prisma.ts'
import {composeApplication,authorized,brandContext} from '../src/lib/ai-native/application.ts'
import {centralModels} from '../src/lib/ai-native/models.ts'
import {initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {actorFor,conversationFrom,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
import {readPlanningInsight,readMarketingWorkspace} from '../src/lib/ai-native/brand-planning.ts'
assert(process.env.RENDER,'Render environment required; use the configured central model')
const schema='navigation_acceptance_'+randomUUID().replaceAll('-','')
const bootstrap=new Pool({connectionString:process.env.DATABASE_URL,max:1})
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,options:`-c search_path=${schema} -c statement_timeout=30000`})
let app:any
try{
 await bootstrap.query(`CREATE SCHEMA ${schema}`)
 await initializeHost(pool)
 const candidates=await prisma.brandGrowthResearchSnapshot.findMany({where:{source:'amc-growth',brand:{status:'ACTIVE'}},orderBy:{generatedAt:'desc'},distinct:['brandId'],take:6,select:{brand:{select:{id:true,name:true,crew:{select:{members:{where:{active:true,role:{in:['OWNER','PRINCIPAL']}},select:{userId:true}}}}}}}})
 let selected:any=null
 for(const {brand} of candidates){
  for(const member of brand.crew?.members||[]){
   const actor=actorFor(brand.id,member.userId)
   if(!await authorized(actor))continue
   const insight=await readPlanningInsight(actor)
   console.log('NAVIGATION_LIVE '+JSON.stringify({phase:'source',brandId:brand.id,name:brand.name,status:insight.status,reportVersionId:'reportVersionId' in insight?insight.reportVersionId:null,partial:'partial'in insight?insight.partial:null}))
   if(['available','cached'].includes(insight.status)){selected={brand,actor,insight};break}
  }
  if(selected)break
 }
 assert(selected,'No authorized brand with an existing Growth insight report')
 const {brand,actor}=selected
 const composition=await composeApplication(pool,await centralModels(),{version:'marketing-expert-review-v1'})
 app=composition.app
 const history:Array<{role:'user'|'assistant';content:string}>=[]
 const saved=await readMarketingWorkspace(actor)
 const startMonth=(saved.workspace as any)?.annualPlan?.planningStartMonth||'2027-01'
 const prompts=[
  {topic:'general',goal:'请打开2027年3月的发布日历，我要查看和审核内容。只打开页面，先不发布。',page:'calendar',month:'2027-03'},
  {topic:'general',goal:'接下来打开素材库，我要上传门店照片并挑选视频制作素材。',page:'assets'},
  {topic:'general',goal:'请带我去修改自己的昵称和个人简介。',page:'profile'},
  {topic:'general',goal:'打开数据分析页面，我想查看账号最近30天的表现。',page:'socialInsight'},
 ] as const
 for(let i=0;i<prompts.length;i++){
  const {goal,topic}=prompts[i]
  const intent:ConversationIntent={kind:'conversation',topic,goal,currentPage:i===0?undefined:prompts[i-1].page,history:[...history],brandId:brand.id,userId:actor.subjectId,requestKey:`live-review-${i}-${schema}`,artifactPath:`work/turn-${i}.json`}
  await admitIntent(pool,actor,intent)
  const allowed=composition.tools.filter(t=>['assistant.skills.list','assistant.skills.read','my_list_assistant_memories','my_read_assistant_memory','my_write_workspace','my_read_workspace','amc.context',...(topic==='brand_planning'?['amc.growth_insight','amc.planning_budget','amc.marketing_workspace']:[])].includes(t))
  const input={goal,requiredArtifacts:[intent.artifactPath],allowedTools:allowed}
  const receipt=await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})
  console.log('NAVIGATION_LIVE '+JSON.stringify({phase:'started',turn:i,taskId:receipt.id,brandId:brand.id,actorId:actor.subjectId,schema}))
  for(let n=0;n<3&&['queued','running'].includes((await app.runtime.state(actor,receipt.id)).status);n++)await app.runtime.tick()
  const task=await app.runtime.get(actor,receipt.id,{history:true}),usage=await app.ledger.taskUsage(await app.scope(actor),receipt.id)
  if(task.status!=='succeeded'){
   console.log('NAVIGATION_LIVE '+JSON.stringify({phase:'stopped',turn:i,status:task.status,waitingReason:task.waiting_reason,question:task.inputRequest?.question,usage,calls:task.calls?.map((c:any)=>({name:c.capability,status:c.status,error:c.error}))}));throw Error('live_conversation_not_completed')
  }
  const artifact=await app.workspace.read(actor,task.result.artifacts.find((a:any)=>a.path===intent.artifactPath))
  const reply=conversationFrom(artifact.content,intent)
  assert(usage.complete,'Actual usage receipt required')
  const calls=task.calls.filter((c:any)=>c.status==='succeeded')
  assert(calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.input.id===(topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md')))
  assert.equal(reply.uiAction?.page,prompts[i].page)
  assert.equal(reply.uiAction?.mode,'open')
  if(i===0)assert.equal(reply.uiAction?.month,'2027-03')
  const growth=calls.find((c:any)=>c.capability==='amc.growth_insight')?.result
  if(topic==='brand_planning')assert(['available','cached'].includes(growth?.status))

  assert.equal((await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})).id,receipt.id)
  history.push({role:'user',content:goal},{role:'assistant',content:reply.content})
  console.log('NAVIGATION_LIVE '+JSON.stringify({phase:'completed',turn:i,taskId:receipt.id,brandId:brand.id,reportStatus:growth?.status,reportVersionId:growth?.reportVersionId,usage,reply:reply.content,uiAction:reply.uiAction,tools:calls.map((c:any)=>c.capability)}))
 }
 console.log('NAVIGATION_LIVE '+JSON.stringify({phase:'passed',schema,brandId:brand.id,turns:prompts.length,retained:'Isolated Core task/artifact/usage evidence; brand records unchanged'}))
}finally{if(app)await app.close();await pool.end();await bootstrap.end();await prisma.$disconnect()}
