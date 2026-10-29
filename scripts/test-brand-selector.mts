import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let auth:any={user:{id:'actor',type:'HUMAN',admin:true}},queries:any[]=[]
const db={brand:{findMany:async(q:any)=>{queries.push(q);return [{id:'brand',name:'Brand',status:'ACTIVE'}]}},organizationMember:{findMany:async()=>[{ownerId:'org-owner'}]}}
const mod={exports:{} as any},deps:any={'next/server':{NextResponse:{json:(data:any,init?:any)=>Response.json(data,init)}},'@/lib/prisma':{prisma:db},'@/lib/amcOperator':{isAmcOperator:(u:any)=>u.admin},'@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth}}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/app/api/brands/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports)
const run=(query='')=>mod.exports.GET(new Request('https://example.test/api/brands'+query))
await run('?view=selector');const admin=queries.at(-1);assert.equal(admin.where.status,'ACTIVE');assert(admin.select.id&&admin.select.name);assert(!admin.include);assert(!('postfastSnapshot' in admin.select));assert(!('postfastApiKey' in admin.select));assert(!('_count' in admin.select))
await run();assert(queries.at(-1).include.accounts);assert(queries.at(-1).include.subscriptions)
auth.user.admin=false;await run('?view=selector');const regular=queries.at(-1);assert.equal(regular.where.OR.length,4);assert.deepEqual(regular.where.OR[3],{crew:{members:{some:{userId:{in:['org-owner']},active:true}}}});assert(regular.select.id)
await run('?view=selector&assignedOnly=true');assert.equal(queries.at(-1).where.OR.length,3)
auth=null;const count=queries.length;assert.equal((await run('?view=selector')).status,401);assert.equal(queries.length,count)
console.log('PASS lightweight selector: no reports/credentials/count queries, unchanged full response, admin/owner/crew/organization/assigned-only filters, unauthenticated rejection')
