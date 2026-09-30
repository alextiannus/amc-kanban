// Recover original zero-dispatch tasks through Core public controls after a rollout.
// The event sequence distinguishes a second interruption from a replay of the first.
import assert from 'node:assert/strict'
import {getNativeHost} from '../src/lib/ai-native/service.ts'
import {applicationVersion} from '../src/lib/ai-native/application.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
assert(process.env.RENDER && process.argv.includes('--apply'))
const host=await getNativeHost()
try {
 assert((await host.app.runtime.drain({timeoutMs:5000})).drained)
 const version=await applicationVersion()
 const rows=(await host.pool.query('SELECT brand_id,owner_id,task_id FROM amc_iaic.autopilot_runs WHERE task_id IS NOT NULL')).rows
 let resumed=0,skipped=0
 for(const row of rows) {
  try {
   const actor=actorFor(row.brand_id,row.owner_id)
   const task=await host.app.runtime.get(actor,row.task_id,{history:true})
   const mismatch=task.events.findLast(event=>event.kind==='version_mismatch')
   if(task.status!=='waiting'||task.waiting_reason!=='interrupted'||task.version!==version||task.calls.length||!mismatch||task.events.some(event=>event.kind==='model_requested')||!(await host.app.ledger.taskUsage(await host.app.scope(actor),task.id)).complete) {skipped++;continue}
   await host.app.dispatcher.invoke('tasks.resume',{id:task.id},{actor,callId:`autopilot-rollout-${task.id}-${mismatch.seq}`})
   resumed++
  } catch {skipped++}
 }
 console.log(JSON.stringify({resumed,skipped,newTasks:0,policy:'current-version, zero-dispatch, settled usage; original task only'}))
} finally {await host.pool.end();await prisma.$disconnect()}
