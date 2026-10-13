// Read-only conversation acceptance through the deployed AMCMM authentication proxy.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {UI_PAGES} from '../src/lib/ai-native/ui-navigation.ts'
const base='https://amc-mm.immedi.ai',brandId='cmpaz4kwn0000lv2aa67iic3o'
try{
 const me=await prisma.user.findUniqueOrThrow({where:{id:'cmrsz84qu009foe2a8xsmimo7'},select:{apiKeys:true}})
 const key=(me.apiKeys as any[]).find(k=>k.token&&!k.revokedAt&&(!k.expiresAt||new Date(k.expiresAt)>new Date()))
 assert(key,'An existing active user API credential is required')
 const headers={Authorization:`Bearer ${key.token}`,'Content-Type':'application/json'}
 const health=await fetch(base+'/api/health').then(r=>r.json())
 const history:Array<{role:'user'|'assistant';content:string}>=[]
 for(const [page,goal] of [['calendar','请打开2027年3月发布日历查看草稿，先不要发布。'],['settings','请打开系统设置，我要查看助理的语言、声音和工作台偏好。']] as const){
  const body={kind:'conversation',topic:'general',goal,history,requestKey:`ui-http-${randomUUID()}`}
  const response=await fetch(`${base}/api/brands/${brandId}/ai/tasks`,{method:'POST',headers,body:JSON.stringify(body)})
  assert(response.ok,`Admission ${response.status}`);const receipt=await response.json()
  console.log('NAVIGATION_HTTP '+JSON.stringify({phase:'started',page,taskId:receipt.id,frontendCommit:health.commit}))
  let task:any
  for(let attempt=0;attempt<90;attempt++){
   const res=await fetch(`${base}/api/brands/${brandId}/ai/tasks/${receipt.id}`,{headers});assert(res.ok,`Read ${res.status}`);task=await res.json()
   if(task.status==='succeeded')break
   assert(!['failed','blocked','paused','cancelled'].includes(task.status),`Task ${task.status}`)
   await new Promise(r=>setTimeout(r,3000))
  }
  assert.equal(task.status,'succeeded');assert.equal(task.report.uiAction.page,page);assert.equal(task.report.uiAction.mode,'open');assert(task.usage.complete)
  const again=await fetch(`${base}/api/brands/${brandId}/ai/tasks`,{method:'POST',headers,body:JSON.stringify(body)}).then(r=>r.json());assert.equal(again.id,receipt.id)
  const anonymous=await fetch(`${base}/api/brands/${brandId}/ai/tasks/${receipt.id}`);assert.equal(anonymous.status,401)
  history.push({role:'user',content:goal},{role:'assistant',content:task.report.content})
  console.log('NAVIGATION_HTTP '+JSON.stringify({phase:'passed',page,label:UI_PAGES[page][0],taskId:receipt.id,action:task.report.uiAction,usageComplete:task.usage.complete,idempotent:true,anonymousDenied:true}))
 }
}finally{await prisma.$disconnect()}
