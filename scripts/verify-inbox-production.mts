import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {inboxState} from '../src/lib/notification/inbox.ts'
assert(process.env.RENDER&&process.argv.includes('--rollback-only'))
const id=`inbox-smoke-${randomUUID()}`,rollback=new Error('verified-rollback')
try{
 await prisma.$transaction(async tx=>{
  await tx.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  await tx.brand.create({data:{id,name:'Inbox rollback fixture',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
  const key=`brand_idea:${id}:idea`
  assert((await inboxState(id,id,{key,action:'remind'},tx)).claimed)
  assert.equal((await inboxState(id,id,{key,action:'remind'},tx)).claimed,false)
  await inboxState(id,id,{key,action:'read'},tx)
  assert((await inboxState(id,id,undefined,tx)).controls[key].readAt)
  assert.equal((await inboxState(id,id,{key,action:'remind'},tx)).claimed,false)
  await assert.rejects(()=>inboxState('no-user',id,undefined,tx),(e:any)=>e.status===404)
  assert.equal(await tx.inboxReceipt.count({where:{userId:id}}),1)
  throw rollback
 },{timeout:30000})
}catch(error){if(error!==rollback)throw error;assert.equal(await prisma.user.findUnique({where:{id}}),null);assert.equal(await prisma.inboxReceipt.count({where:{userId:id}}),0);console.log(JSON.stringify({ok:true,version:process.env.RENDER_GIT_COMMIT,checks:['one reminder','read retained','authorization','no duplicate rows','complete rollback']}))}
finally{await prisma.$disconnect()}
