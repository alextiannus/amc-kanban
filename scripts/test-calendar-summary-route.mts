import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {calendarSummarySql} from '../src/lib/brand-plan/calendarProjection.ts'
let authenticated=true,allowed=true,reads=0,fullReads=0
const mod={exports:{} as any},deps:any={
 '@/lib/prisma':{prisma:{$queryRawUnsafe:async(sql:string,id:string)=>{assert.equal(sql,calendarSummarySql);assert.equal(id,'brand');reads++;return[{marketingSolution:{publishingCalendar:{months:{}}}}]}}},
 '@/lib/brand-plan/calendarProjection':{calendarSummarySql},
 '@/lib/brand-plan/creativeRevisions':{CreativeRevisionError:class extends Error{}},
 'next/server':{NextResponse:{json:(data:any,init?:any)=>Response.json(data,init)}},
 '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>authenticated?{user:{id:'actor',type:'HUMAN',role:'USER'}}:null},
 '@/lib/brandAccess':{canSessionAccessBrandProject:async()=>allowed},
 '@/lib/brand-plan/service':{getBrandPlan:async()=>{fullReads++;return{full:true}},BrandPlanError:class extends Error{}},
}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/app/api/brands/[id]/brand-plan/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((name:string)=>{assert(name in deps,name);return deps[name]},mod,mod.exports)
const call=(query='?view=calendar')=>mod.exports.GET(new Request('https://example.test/api/brands/brand/brand-plan'+query),{params:Promise.resolve({id:'brand'})})
assert.equal((await call()).status,200);assert.equal(reads,1);assert.equal(fullReads,0)
assert.equal((await call('')).status,200);assert.equal(fullReads,1)
allowed=false;assert.equal((await call()).status,404);assert.equal(reads,1)
authenticated=false;assert.equal((await call()).status,401);assert.equal(reads,1)
console.log('PASS calendar summary retains authorization, no research synchronization/full-plan read, unchanged default route')
