// Post-deploy recovery through Core's public controls; never edit task state tables.
import assert from 'node:assert/strict'
import {getNativeHost} from '../src/lib/ai-native/service.ts'
import {dailyActorFor} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
assert(process.env.RENDER&&process.argv.includes('--apply'))
const host=await getNativeHost()
try{
 assert((await host.app.runtime.drain({timeoutMs:5000})).drained)
 const rows=(await host.pool.query('SELECT brand_id,owner_id,task_id FROM amc_iaic.brand_ideas WHERE replaced_at IS NULL AND plan_id IS NULL AND task_id IS NOT NULL')).rows
 let resumed=0,skipped=0
 for(const row of rows){try{
  const actor=dailyActorFor(row.brand_id,row.owner_id)
  // get revalidates source and authorization; resume below enforces application version.
  const task=await host.app.runtime.get(actor,row.task_id,{history:true})
  const mismatch=task.events.findLast(event=>event.kind==='version_mismatch')
  if(task.status!=='waiting'||task.waiting_reason!=='interrupted'||task.calls.length||!mismatch||!(await host.app.ledger.taskUsage(await host.app.scope(actor),row.task_id)).complete){skipped++;continue}
  await host.app.dispatcher.invoke('tasks.resume',{id:row.task_id},{actor,callId:`daily-deploy-resume-${row.task_id}-${mismatch.seq}`})
  resumed++
 }catch{skipped++}}
 console.log(JSON.stringify({ok:true,resumed,skipped,newTasks:0,policy:'current-version, interrupted by old executor, zero calls, settled usage'}))
}finally{await host.pool.end();await prisma.$disconnect()}
