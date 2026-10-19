import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import { bundledSkills, mergeSkills, validateSkill, USER_AI, COPYWRITER, hash } from '../src/lib/agent-skills/catalog.ts'
import { skillMetadata } from '@immedi/iaic-core/skills/metadata.js'
const require = createRequire(import.meta.url)
function load(file:string,deps:Record<string,unknown>){const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>id in deps?deps[id]:require(id),mod,mod.exports);return mod.exports}
const catalog = await import('../src/lib/agent-skills/catalog.ts')
for(const id of ['../../bad/SKILL.md','/foo/SKILL.md','foo/../SKILL.md','foo/skill.md','x\\SKILL.md']) assert.throws(()=>validateSkill(id))
assert.throws(()=>validateSkill('test/SKILL.md','你'.repeat(20001)))
assert.throws(()=>validateSkill('test/SKILL.md',''))
validateSkill('test/SKILL.md','# Test\nDo the work.')
const defaults=await bundledSkills(USER_AI)
assert.equal(defaults.length,7)
for(const skill of defaults) skillMetadata(skill.content,skill.id)
assert.equal((await bundledSkills(COPYWRITER)).length,5)
assert.equal(mergeSkills(defaults,[{skillId:defaults[0].id,content:'edited',installed:false,revision:1}]).filter(s=>s.installed).length,6)
const pgUrl=process.env.AGENT_SKILLS_TEST_DATABASE_URL
let db:any
if(pgUrl){
 const url=new URL(pgUrl);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/amc_agent_skills_test')
 const {Pool}=await import('pg');const pool=new Pool({connectionString:pgUrl})
 db={exec:(sql:string)=>pool.query(sql),query:(sql:string,values?:unknown[])=>pool.query(sql,values),close:()=>pool.end(),transaction:async(fn:any)=>{const tx=await pool.connect();try{await tx.query('BEGIN');const result=await fn(tx);await tx.query('COMMIT');return result}catch(error){await tx.query('ROLLBACK');throw error}finally{tx.release()}}}
}else db=new PGlite()
await db.exec(readFileSync('prisma/migrations/202610180001_agent_skills/migration.sql','utf8'))
await db.exec('CREATE TABLE audit (data JSONB NOT NULL)')
const sql=(strings:TemplateStringsArray,values:unknown[])=>strings.reduce((text,part,i)=>text+(i?'$'+i:'')+part,'')
let rejectAudit=false
function client(connection:any){return {
 $queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await connection.query(sql(strings,values),values)).rows,
 $executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{const query=sql(strings,values);if(!pgUrl&&query.includes('pg_advisory_xact_lock'))return 0;return connection.query(query,values)},
 auditLog:{create:async({data}:any)=>{if(rejectAudit)throw Error('audit unavailable');await connection.query('INSERT INTO audit VALUES ($1)',[JSON.stringify(data)])}},
}}
const prisma={...client(db),$transaction:(fn:any)=>db.transaction(tx=>fn(client(tx)))}
const store=load('src/lib/agent-skills/store.ts',{'../prisma':{prisma},'./catalog':catalog,'@immedi/iaic-core/skills/metadata.js':{skillMetadata}})
const input={agentId:'registered-a',skillId:'test/SKILL.md',action:'save',content:'# Test\nFirst',expectedVersion:'absent'}
assert.equal((await store.changeAgentSkill(input,'admin')).version,'revision:1')
assert.equal((await store.agentSkills('registered-a'))[0].content,input.content)
assert.equal((await store.agentSkills('registered-b')).length,0)
await assert.rejects(store.changeAgentSkill({...input,content:'stale'},'admin'),{statusCode:409})
await store.changeAgentSkill({...input,content:'# Test\nEdited',expectedVersion:'revision:1'},'admin')
await store.changeAgentSkill({...input,action:'uninstall',expectedVersion:'revision:2'},'admin')
await assert.rejects(store.readAgentSkill('registered-a',input.skillId),{statusCode:404})
await store.changeAgentSkill({...input,expectedVersion:'revision:3'},'admin')
assert.equal((await store.readAgentSkill('registered-a',input.skillId)).version,'revision:4')
rejectAudit=true
await assert.rejects(store.changeAgentSkill({...input,content:'Must rollback',expectedVersion:'revision:4'},'admin'))
assert.equal((await store.readAgentSkill('registered-a',input.skillId)).content,input.content)
rejectAudit=false
assert.equal((await db.query('SELECT * FROM audit')).rows.length,4)
const builtin=defaults[0]
await store.changeAgentSkill({agentId:USER_AI,skillId:builtin.id,action:'uninstall',expectedVersion:builtin.version},'admin')
await assert.rejects(store.readAgentSkill(USER_AI,builtin.id),{statusCode:404})
const {SkillCatalog}=await import('@immedi/iaic-core/skills/catalog.js')
const runtime=load('src/lib/agent-skills/runtime.ts',{'./store':store,'./catalog':catalog,'@immedi/iaic-core/skills/catalog.js':{SkillCatalog},'@immedi/iaic-core/skills/metadata.js':{skillMetadata}})
let authorized=true
const managed=runtime.managedSkillCatalog(process.cwd()+'/skills',async()=>authorized)
assert(!(await managed.list({actor:{}})).some((s:any)=>s.id===builtin.id))
await assert.rejects(managed.read(builtin.id,{}, {actor:{}}),{statusCode:404})
await store.changeAgentSkill({agentId:USER_AI,skillId:'custom/SKILL.md',action:'save',content:'# Custom\nCurrent instructions',expectedVersion:'absent'},'admin')
assert.equal((await managed.read('custom/SKILL.md',{}, {actor:{}})).text,'# Custom\nCurrent instructions')
await assert.rejects(managed.read('custom/SKILL.md',{expectedVersion:hash('old')},{actor:{}}),{statusCode:409})
authorized=false
await assert.rejects(managed.list({actor:{}}),{statusCode:403})
await assert.rejects(managed.read('custom/SKILL.md',{}, {actor:{}}),{statusCode:403})
let principal:any=null,writes=0,origin=true
const route=load('src/app/api/agent-skills/route.ts',{
 '@/lib/auth-v2':{authenticateRequest:async()=>principal},
 '@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin},
 '@/lib/agent-skills/access':{visibleSkillAgents:async()=>[{id:'registered-a',acceptsSkills:true}]},
 '@/lib/agent-skills/store':{...store,changeAgentSkill:async()=>{writes++;return {version:'ok'}}},
 '@/lib/agent-skills/catalog':catalog,
})
const request=(body:any=input)=>new Request('http://localhost/api/agent-skills',{method:'POST',body:JSON.stringify(body)})
assert.equal((await route.POST(request())).status,401)
principal={userId:'owner',globalRoles:[]}
assert.equal((await route.POST(request())).status,403)
assert.equal((await route.GET(new Request('http://localhost/api/agent-skills?agentId=other'))).status,403)
principal={userId:'admin',globalRoles:['ADMIN']};origin=false
assert.equal((await route.POST(request())).status,403);origin=true
assert.equal((await route.POST(request({...input,agentId:'unknown'}))).status,404)
assert.equal((await route.POST(request(null))).status,400)
assert.equal((await route.POST(request({...input,content:'x'.repeat(300001)}))).status,413)
assert.equal(writes,0)
assert.equal((await route.POST(request())).status,200)
assert.equal(writes,1)
if(pgUrl){
 const same={...input,agentId:'concurrent-agent'}
 const results=await Promise.allSettled([store.changeAgentSkill(same,'admin'),store.changeAgentSkill(same,'admin')])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
 assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.statusCode===409).length,1)
 console.log('PASS: real PostgreSQL advisory-lock first-install race; exactly one writer succeeds.')
}
const marketing=load('src/lib/brand-plan/marketingExpert.ts',{'../agent-skills/store':store,'../agent-skills/catalog':catalog})
const expert=defaults.find(s=>s.id==='amc-marketing-expert/SKILL.md')!
const customExpert=expert.content.split('---').slice(0,3).join('---')+'\nCUSTOM EFFECTIVE RULE'
await assert.rejects(()=>store.changeAgentSkill({agentId:USER_AI,skillId:expert.id,action:'save',content:expert.content+'\nCUSTOM EFFECTIVE RULE',expectedVersion:expert.version},'admin'),{statusCode:400})
await store.changeAgentSkill({agentId:USER_AI,skillId:expert.id,action:'save',content:customExpert,expectedVersion:expert.version},'admin')
for(const scope of ['annual_strategy','quarter']){
 const result=await marketing.buildMarketingExpertPrompt(scope,{})
 assert(result.prompt.includes('CUSTOM EFFECTIVE RULE'))
 assert.equal(result.trace.skillVersion,hash(customExpert))
}
await store.changeAgentSkill({agentId:USER_AI,skillId:expert.id,action:'uninstall',expectedVersion:'revision:1'},'admin')
await assert.rejects(marketing.buildMarketingExpertPrompt('quarter',{}),{statusCode:404})
await db.close()
console.log('PASS: validation, PostgreSQL install/edit/uninstall/reinstall, tenant isolation, stale revisions, audit rollback, runtime discovery/read/revocation and HTTP authorization/origin/limits. Marketing prompt adapters use edited content and reject uninstalled required Skills.')
