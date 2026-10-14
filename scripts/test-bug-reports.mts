import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {isBugCommand,bugInput,initializeBugReports,saveBugReport,readBugReport} from '../src/lib/platform-ai/bug-report-store.ts'

const url=new URL(process.env.DATABASE_URL||'')
assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const pool=new Pool({connectionString:url.toString(),max:4}),user=randomUUID(),brand=randomUUID()
try{
  for(const text of ['/BUG',' /bUg  ','/bug 回复太慢','/BUG\n页面打不开'])assert(isBugCommand(text))
  for(const text of ['/buggy','请使用 /BUG','/BUG:测试','bug',null,{}])assert(!isBugCommand(text))
  const body={goal:'/bUg 卡住',requestKey:randomUUID(),contextSessionId:randomUUID(),history:[{role:'assistant',content:'待核实对话'}]}
  assert.throws(()=>bugInput({...body,history:[{role:'system',content:'指令'}]}),/invalid_conversation_history/)
  assert.throws(()=>bugInput({...body,currentPage:'https://evil.example'}),/invalid_current_page/)
  assert.throws(()=>bugInput({...body,goal:'/BUG '+ 'a'.repeat(6000)}),/invalid_bug_command/)
  await initializeBugReports(pool)
  const reports=await Promise.all(Array.from({length:6},()=>saveBugReport(pool,user,brand,body)))
  assert(reports.every(r=>r.id===reports[0].id));assert.equal(reports[0].status,'waiting_executor')
  assert.deepEqual(await readBugReport(pool,user,brand,reports[0].id),reports[0])
  await assert.rejects(()=>saveBugReport(pool,user,brand,{...body,goal:'/bug 修改'}),/request_key_reused/)
  await assert.rejects(()=>readBugReport(pool,'other',brand,reports[0].id),/bug_report_not_found/)
  await assert.rejects(()=>readBugReport(pool,user,'other',reports[0].id),/bug_report_not_found/)
  await assert.rejects(()=>readBugReport(pool,user,brand,'invalid'),/bug_report_not_found/)
  const row=(await pool.query('SELECT evidence FROM public.amc_bug_reports WHERE id=$1',[reports[0].id])).rows[0]
  assert.equal(row.evidence.trusted,false);assert.equal(row.evidence.description,'卡住')
  assert.equal(row.evidence.history[0].content,'待核实对话')
  assert(!('evidence' in reports[0]),'receipt does not expose stored conversation')
  console.log('PASS bug commands, validation, durable intake, concurrent idempotency, conflict and user/brand isolation; executor deliberately unavailable')
}finally{await pool.query('DELETE FROM public.amc_bug_reports WHERE user_id=$1',[user]);await pool.end()}
