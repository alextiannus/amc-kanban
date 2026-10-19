// Explicit real-model acceptance for the user-authorized AI Marketing Crew brand.
// Uses production HTTP; never runs a second executor or publishes content.
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
const phase=Number(process.argv[2]),db=new PrismaClient(),session='b5b9ee50-b4b4-4427-a561-83bde322dc7d'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance')&&[1,2,3].includes(phase))
const deadline=Date.now()+235000,timer=setTimeout(()=>process.exit(2),265000);timer.unref()
let key
try{
 const brand=await db.brand.findUnique({where:{id:'cmpw2kbcb0009jr29r63q12oy'},select:{id:true,name:true,crew:{select:{members:{select:{userId:true,role:true}}}}}})
 assert.equal(brand?.name,'AI Marketing Crew')
 const userId=brand.crew.members.find(m=>m.role==='PRINCIPAL')?.userId;assert(userId)
 const token='amc_key_'+randomBytes(32).toString('base64url')
 key=await db.userApiKey.create({data:{userId,tokenHash:createHash('sha256').update(token).digest('hex'),prefix:token.slice(0,12),name:'Assistant release acceptance',expiresAt:new Date(Date.now()+600000),lastUsedAt:new Date()}})
 const base=`https://amc-mm.immedi.ai/api/brands/${brand.id}/ai`
 async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const value=await r.json();assert(r.ok,JSON.stringify({path,status:r.status,error:value.error}));return value}
 const runtime=await api('/runtime');assert(runtime.skills.some(s=>s.id==='amc-marketing-expert/SKILL.md'&&s.installed))
 let previous
 if(phase>1){const history=await api('/conversations?id='+session);previous=history.items.find(i=>i.body.requestKey===`assistant-release-20261019-${phase-1}`);assert(previous?.task.status==='succeeded'&&previous.task.planningSave?.verified,'previous turn must be saved')}
 const goals=[
 '请根据 AI Marketing Crew 当前真实品牌资料制定完整品牌营销策略，从2026年10月开始。保留已有确认事实、产品与服务定价，不虚构客户案例、预算或经营指标。缺少信息明确标注为待补充，并给出可执行的建议，不要等待审批。自动保存完整策略。本次仅制定策略，不发布内容、不投放、不生成付费视频。',
 '在刚才已保存的完整策略上继续迭代：首月重点聚焦中小企业主的AI营销需求，优先自然内容和产品演示。保留品牌定位与已确认事实，不改实际定价，不把建议预算当授权。更新对应章节并自动保存完整版本，其余章节保持完整。',
 '继续完善刚才的策略：给首月计划补充每周复盘节奏、线索质量观察指标和从内容演示到咨询的转化路径。没有基线的数据标为待建立，不编造转化率。保留上一轮渠道优先级和品牌定位，自动保存完整策略，并简要说明本轮变化。'
 ]
 const body={kind:'conversation',topic:'brand_planning',conversationId:session,contextSessionId:session,autoSavePlanning:true,planningScope:{stage:'marketing_plan',mode:'draft',startMonth:'2026-10'},goal:goals[phase-1],requestKey:`assistant-release-20261019-${phase}`,history:[],...(previous?{afterTaskId:previous.taskId}:{})}
 const admitted=await api('/tasks',body);console.log('AMC_ASSISTANT_ACCEPTANCE '+JSON.stringify({phase,event:'admitted',brandId:brand.id,taskId:admitted.id,session}))
 // Leave the browser disconnected; the persistent server worker owns generation and saving.
 let task
 while(Date.now()<deadline){await new Promise(r=>setTimeout(r,5000));task=await api('/tasks/'+admitted.id+'?view=status');if(['succeeded','failed','cancelled','waiting','paused'].includes(task.status))break}
 assert.equal(task?.status,'succeeded',JSON.stringify({taskId:admitted.id,status:task?.status,reason:task?.waitingReason}))
 task=await api('/tasks/'+admitted.id);assert.equal(task.planningSave?.verified,true,JSON.stringify(task.planningSave))
 const inspection=await api('/tasks/'+admitted.id+'/inspection');assert(Number(inspection.usage.providerTokens)>0);assert(inspection.artifacts.length>0)
 const restored=await api('/conversations?id='+session);assert(restored.items.some(i=>i.taskId===admitted.id&&i.task.planningSave?.verified))
 const versions=await api('/strategy-versions');assert(versions.items.some(v=>v.id===task.planningSave.versionId))
 const replay=await api('/tasks',body);assert.equal(replay.id,admitted.id)
 console.log('AMC_ASSISTANT_ACCEPTANCE '+JSON.stringify({phase,event:'verified',brandId:brand.id,taskId:admitted.id,session,save:task.planningSave,usage:inspection.usage,tools:inspection.tools,restoredTurns:restored.items.length,replyExcerpt:task.report.content.slice(0,500),replaySameTask:true}))
}finally{if(key)await db.userApiKey.update({where:{id:key.id},data:{revokedAt:new Date()}});await db.$disconnect()}
