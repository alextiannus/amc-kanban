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
import {readPlanningInsight} from '../src/lib/ai-native/brand-planning.ts'
assert(process.env.RENDER,'Render environment required; use the configured central model')
const schema='planning_acceptance_'+randomUUID().replaceAll('-','')
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
   console.log('PLANNING_LIVE '+JSON.stringify({phase:'source',brandId:brand.id,name:brand.name,status:insight.status,reportVersionId:'reportVersionId' in insight?insight.reportVersionId:null,partial:'partial'in insight?insight.partial:null}))
   if(['available','cached'].includes(insight.status)){selected={brand,actor,insight};break}
  }
  if(selected)break
 }
 assert(selected,'No authorized brand with an existing Growth insight report')
 const {brand,actor}=selected
 const composition=await composeApplication(pool,await centralModels(),{version:'marketing-expert-review-v1'})
 app=composition.app
 const history:Array<{role:'user'|'assistant';content:string}>=[]
 const prompts=[
  {topic:'brand_planning',goal:'使用 AMC 营销专家和我一步步讨论。请先结合已有 Insight，简要指出两个营销机会并问最关键的访谈问题，不要现在就给完整年度计划。这是验收练习，所有回答仅用于讨论，不保存品牌资料或执行。'},
  {topic:'brand_planning',goal:'访谈练习中的假设：希望让附近家庭把我们作为周末聚餐选择；计划 2027 年 1 月至 12 月，新加坡，年度推广预算 SGD 36000，团队一位主理人加兼职拍摄。不要编造基线业绩。我还没选宣传重心，请给两个有取舍的方向和推荐，让我商量，不要把你的推荐当作我已确认。'},
  {topic:'brand_planning',goal:'我选择你上一轮推荐的第一个方向作为主宣传重心。请结合现有证据提炼一个核心卖点和两个支撑卖点，指出哪些待验证；此轮只讨论卖点，先别展开年度计划。'},
  {topic:'brand_planning',goal:'我认可上一轮的宣传重心与卖点作为待验证的策划假设。请用已给出的 2027 年周期、SGD 36000 总预算和人力，产出年度推广计划讨论稿，包含四季度主线、1到12月各自重点、预算合计、KPI口径、月度复盘和前30天动作。不要把假设称为已验证事实，节日日期未经核实不要编造，不保存也不执行。'},
 ] as const
 for(let i=0;i<prompts.length;i++){
  const {goal,topic}=prompts[i]
  const intent:ConversationIntent={kind:'conversation',topic,goal,history:[...history],brandId:brand.id,userId:actor.subjectId,requestKey:`live-review-${i}-${schema}`,artifactPath:`work/turn-${i}.json`}
  await admitIntent(pool,actor,intent)
  const allowed=composition.tools.filter(t=>['assistant.skills.list','assistant.skills.read','my_list_assistant_memories','my_read_assistant_memory','my_write_workspace','my_read_workspace','amc.context',...(topic==='brand_planning'?['amc.growth_insight','amc.planning_budget']:[])].includes(t))
  const input={goal,requiredArtifacts:[intent.artifactPath],allowedTools:allowed}
  const receipt=await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})
  console.log('PLANNING_LIVE '+JSON.stringify({phase:'started',turn:i,taskId:receipt.id,brandId:brand.id,actorId:actor.subjectId,schema}))
  for(let n=0;n<3&&['queued','running'].includes((await app.runtime.state(actor,receipt.id)).status);n++)await app.runtime.tick()
  const task=await app.runtime.get(actor,receipt.id,{history:true}),usage=await app.ledger.taskUsage(await app.scope(actor),receipt.id)
  if(task.status!=='succeeded'){
   console.log('PLANNING_LIVE '+JSON.stringify({phase:'stopped',turn:i,status:task.status,waitingReason:task.waiting_reason,question:task.inputRequest?.question,usage,calls:task.calls?.map((c:any)=>({name:c.capability,status:c.status,error:c.error}))}));throw Error('live_conversation_not_completed')
  }
  const artifact=await app.workspace.read(actor,task.result.artifacts.find((a:any)=>a.path===intent.artifactPath))
  const reply=conversationFrom(artifact.content,intent)
  assert(usage.complete,'Actual usage receipt required')
  const calls=task.calls.filter((c:any)=>c.status==='succeeded')
  assert(calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.input.id===(topic==='brand_planning'?'amc-marketing-expert/SKILL.md':'amc-conversation/SKILL.md')))
  const growth=calls.find((c:any)=>c.capability==='amc.growth_insight')?.result
  if(topic==='brand_planning')assert(['available','cached'].includes(growth?.status))
  assert.equal((await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})).id,receipt.id)
  history.push({role:'user',content:goal},{role:'assistant',content:reply.content})
  console.log('PLANNING_LIVE '+JSON.stringify({phase:'completed',turn:i,taskId:receipt.id,brandId:brand.id,reportStatus:growth?.status,reportVersionId:growth?.reportVersionId,usage,reply:reply.content,tools:calls.map((c:any)=>c.capability)}))
 }
 console.log('PLANNING_LIVE '+JSON.stringify({phase:'passed',schema,brandId:brand.id,turns:prompts.length,retained:'Isolated Core task/artifact/usage evidence; brand records unchanged'}))
}finally{if(app)await app.close();await pool.end();await bootstrap.end();await prisma.$disconnect()}
