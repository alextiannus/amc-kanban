// Offline only: route imports are allowlisted; no real database, network or mail.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')
const source = 'Source: amc-official-website-contact-us'
const body = { brandName:'Fixture', market:'SG', category:'Food', contactName:'Test', email:'test@example.invalid', consent:true, mainConcern:'New question' }
function fixture(opts={}) {
 let row = opts.newLead ? null : { id:'fixture', name:'Fixture', email:body.email, phone:null, status:'CONTACTED', bdUserId:'owner', notes:source+'\nHuman follow-up: demo agreed', updatedAt:new Date(0), ...opts.row }
 let writes=0, mails=0, transactions=0, conflict=opts.conflict, failures=opts.failures || 0
 const snapshot=()=>row && {...row}
 const db={salesLead:{
  findFirst:async()=>snapshot(), findUnique:async()=>snapshot(),
  update:async({data})=>{writes++;row={...row,...data,updatedAt:new Date()};return snapshot()},
  create:async({data})=>{writes++;row={id:'fixture',...data,updatedAt:new Date()};return snapshot()}
 }}
 db.$transaction=async(fn,settings)=>{
  assert.equal(settings.isolationLevel,'Serializable');transactions++
  if(failures-->0)throw Object.assign(new Error('fixture db failure'),{code:opts.failureCode || 'P2034'})
  const before=snapshot();const result=await fn(db)
  if(conflict){conflict=false;row={...before,notes:before.notes+'\nConcurrent human note',status:'DEMO_SCHEDULED'};throw Object.assign(new Error('serialization'),{code:'P2034'})}
  return result
 }
 const modules={'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},'@/lib/prisma':{prisma:db},'@/lib/email':{sendContactUsTrialInviteEmail:async()=>{mails++;if(opts.fillDuringMail)row={...row,notes:row.notes+'x'.repeat(65536)};if(opts.duringMail)row={...row,notes:row.notes+'\nHuman note during mail',status:'ONBOARDED'};return opts.mailSuccess?{success:true,messageId:'fixture-message'}:{success:false}}}}
 const code=ts.transpileModule(fs.readFileSync('src/app/api/public/contact-us/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};vm.runInNewContext(code,{exports,require:id=>{assert.ok(id in modules);return modules[id]},Date,Map,console:{error(){}}})
 return {post:(data={})=>exports.POST({json:async()=>({...body,...data}),headers:new Headers()}),state:()=>({row,writes,mails,transactions})}
}
for(const status of ['CONTACTED','DEMO_SCHEDULED','ONBOARDED','REJECTED','NEW'])test('repeat preserves '+status+' and human notes',async()=>{const f=fixture({row:{status}});assert.equal((await f.post()).status,200);assert.equal(f.state().row.status,status);assert.match(f.state().row.notes,/Human follow-up/);assert.match(f.state().row.notes,/New question/);assert.equal(f.state().row.bdUserId,'owner')})
test('new enquiry still creates NEW unassigned record',async()=>{const f=fixture({newLead:true});assert.equal((await f.post()).status,201);assert.equal(f.state().row.status,'NEW');assert.equal(f.state().row.bdUserId,null)})
test('identical retry does not grow notes',async()=>{const f=fixture();await f.post();const notes=f.state().row.notes;await f.post();assert.equal(f.state().row.notes,notes)})
test('null notes defensive merge',async()=>{const f=fixture({row:{notes:null}});await f.post();assert.match(f.state().row.notes,/New question/)})
test('concurrent update retries and preserves newer human state',async()=>{const f=fixture({conflict:true});await f.post();assert.match(f.state().row.notes,/Concurrent human note/);assert.equal(f.state().row.status,'DEMO_SCHEDULED');assert.ok(f.state().transactions>=2)})
test('mail bookkeeping preserves intervening notes and state',async()=>{const f=fixture({mailSuccess:true,duringMail:true});await f.post();assert.match(f.state().row.notes,/Human note during mail/);assert.match(f.state().row.notes,/fixture-message/);assert.equal(f.state().row.status,'ONBOARDED')})
test('oversized history rejected without truncating or sending',async()=>{const notes=source+'\n'+'x'.repeat(65536);const f=fixture({row:{notes}});assert.equal((await f.post()).status,409);assert.equal(f.state().row.notes,notes);assert.equal(f.state().writes,0);assert.equal(f.state().mails,0)})
test('invalid input and honeypot do not write',async()=>{const f=fixture();assert.equal((await f.post({email:'bad'})).status,400);assert.equal((await f.post({company:'bot'})).status,200);assert.equal(f.state().writes,0)})

test('serialization retries do not send duplicate mail',async()=>{const f=fixture({failures:2,mailSuccess:true});assert.equal((await f.post()).status,200);assert.equal(f.state().mails,1);assert.equal(f.state().transactions,4)})
test('serialization retry budget exhausts without mail',async()=>{const f=fixture({failures:10});assert.equal((await f.post()).status,500);assert.equal(f.state().transactions,3);assert.equal(f.state().mails,0)})
test('unknown db failure is never retried',async()=>{const f=fixture({failures:1,failureCode:'UNKNOWN'});assert.equal((await f.post()).status,500);assert.equal(f.state().transactions,1);assert.equal(f.state().mails,0)})
test('mail receipt cannot truncate history or falsely reject saved enquiry',async()=>{const f=fixture({mailSuccess:true,fillDuringMail:true});const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).emailSent,true);assert.match(f.state().row.notes,/Human follow-up/);assert.ok(f.state().row.notes.endsWith('x'.repeat(65536)));assert.equal(f.state().mails,1)})
test('distinct repeated enquiry retains both messages',async()=>{const f=fixture();await f.post();await f.post({mainConcern:'Second question'});assert.match(f.state().row.notes,/New question/);assert.match(f.state().row.notes,/Second question/);assert.match(f.state().row.notes,/Human follow-up/)})
test('repeated honeypot and invalid consent do not create records',async()=>{const f=fixture({newLead:true});assert.equal((await f.post({consent:false})).status,400);assert.equal((await f.post({company:'bot'})).status,200);assert.equal(f.state().row,null);assert.equal(f.state().mails,0)})
