// Run after deployment with the brand's existing human API key; never creates credentials.
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {prisma} from '../src/lib/prisma.ts'
const [brandId,userId]=process.argv.slice(2)
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'),'Explicit Render acceptance required')
assert(brandId&&userId)
const base='https://amc-mm.immedi.ai'
try{
 const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{apiKeys:true,status:true,type:true}})
 assert.equal(user.status,'ACTIVE');assert.equal(user.type,'HUMAN')
 const key=(user.apiKeys as any[]).find(k=>k.token&&!k.revokedAt&&(!k.expiresAt||new Date(k.expiresAt)>new Date()))
 assert(key,'Existing active API key required; do not create credentials for this test')
 async function call(path:string,body?:unknown){
  const response=await fetch(base+path,{headers:{Authorization:`Bearer ${key.token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)})
  const data=await response.json();assert(response.ok,`HTTP ${response.status}: ${data.error||'request failed'}`);return data
 }
 const me=await call('/api/auth/me');assert.equal(me.id,userId)
 const url=`/api/brands/${encodeURIComponent(brandId)}/ai/tasks`
 const input={kind:'conversation',topic:'brand_planning',goal:'讨论品牌策划。请先读取现有洞察报告，用简短中文说明报告版本与一个最重要的品牌访谈问题。这是上线验收，只讨论，不保存正式策划、不生成内容或发布。',history:[],requestKey:'planning-release-http-20261013-v1'}
 const accepted=await call(url,input)
 assert.equal((await call(url,input)).id,accepted.id)
 console.log('PLANNING_HTTP '+JSON.stringify({phase:'accepted',taskId:accepted.id,brandId,userId,sameKeyReplay:true}))
 let task=await call(`${url}/${accepted.id}`)
 const deadline=Date.now()+540000
 while(['queued','running'].includes(task.status)&&Date.now()<deadline){await delay(3500);task=await call(`${url}/${accepted.id}`)}
 console.log('PLANNING_HTTP '+JSON.stringify({phase:'result',taskId:task.id,status:task.status,waitingReason:task.waitingReason,usage:task.usage,report:task.report,historyUnavailable:task.historyUnavailable}))
 assert.equal(task.status,'succeeded');assert.equal(task.kind,'conversation');assert.equal(task.report.brandId,brandId);assert(task.report.content&&task.usage.complete)
 const anonymous=await fetch(base+`${url}/${accepted.id}`,{signal:AbortSignal.timeout(30000)})
 assert([401,403].includes(anonymous.status))
 console.log('PLANNING_HTTP '+JSON.stringify({phase:'passed',taskId:task.id,authenticatedMMProxy:true,anonymousRejected:true,receiptVerified:true}))
}finally{await prisma.$disconnect()}
