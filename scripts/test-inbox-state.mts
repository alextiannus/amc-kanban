import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {inboxState} from '../src/lib/notification/inbox.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const ids=[randomUUID(),randomUUID()],brands=[randomUUID(),randomUUID()]
try{
 for(const id of ids)await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:'isolated-test',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 for(let n=0;n<2;n++)await prisma.brand.create({data:{id:brands[n],name:'Inbox fixture',status:'ARCHIVED',crew:{create:{members:{create:{userId:ids[n],role:'PRINCIPAL'}}}}}})
 const key=`brand_idea:brand-idea:${brands[0]}:idea`
 const results=await Promise.all(Array.from({length:8},()=>inboxState(ids[0],brands[0],{key,action:'remind'})))
 assert.equal(results.filter(r=>r.claimed).length,1,'atomic single reminder across tabs/devices')
 await inboxState(ids[0],brands[0],{key,action:'read'})
 const read=await inboxState(ids[0],brands[0]);assert(read.controls[key].readAt);assert(read.controls[key].remindedAt)
 assert.equal((await inboxState(ids[0],brands[0],{key,action:'remind'})).claimed,false)
 assert.equal(Object.keys((await inboxState(ids[1],brands[1])).controls).length,0)
 await assert.rejects(()=>inboxState(ids[1],brands[0]),(e:any)=>e.status===404)
 const before='brand_idea:read-before-remind';await inboxState(ids[0],brands[0],{key:before,action:'read'});assert.equal((await inboxState(ids[0],brands[0],{key:before,action:'remind'})).claimed,false)
 const snooze='action:snoozed';await inboxState(ids[0],brands[0],{key:snooze,action:'snooze'});assert.equal((await inboxState(ids[0],brands[0],{key:snooze,action:'remind'})).claimed,false)
 const global=await prisma.notification.create({data:{userId:ids[0],type:'INFO',title:'Global',message:'Global fixture'}})
 const globalKey=`notification:${global.id}`
 assert((await inboxState(ids[0],undefined,{key:globalKey,action:'remind'})).claimed)
 assert.equal((await inboxState(ids[0],brands[0],{key:globalKey,action:'remind'})).claimed,false,'global notification does not re-alert on brand selection')
 await assert.rejects(()=>inboxState(ids[1],brands[1],{key:globalKey,action:'read'}),(e:any)=>e.status===404)
 console.log('PASS: concurrent one-time reminders, persistent reads, read-before-remind, snooze, user/brand isolation, global notification ownership')
}finally{await prisma.brand.deleteMany({where:{id:{in:brands}}});await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect()}
