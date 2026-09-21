import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
const { changePrincipalInTransaction, assignmentVersion } = await import('../src/lib/brand-operations/service.ts')
function compile(path: string, deps: Record<string, unknown>) {
  const module = { exports: {} as any }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require','module','exports',code)((name: string) => { assert(name in deps, name); return deps[name] },module,module.exports)
  return module.exports
}
class OperationsError extends Error { constructor(message: string, public status: number) { super(message) } }
const json = (data: unknown, status=200) => Response.json(data,{status})
const http = { operationsJson: json, operationsFailure: (e: any) => json({error:e.message},e.status || 503) }
let actor: any = null, trusted = true, assigned = false
const route = compile('src/app/api/admin/brands/[id]/principal/route.ts', {
  '@/lib/auth-v2': { authenticateCurrentSession: async()=>actor, isAdmin:(a:any)=>a.globalRoles.includes('ADMIN') },
  '@/lib/role-permissions/request-origin': { allowedRoleWriteOrigin:()=>trusted },
  '@/lib/brand-operations/http': http,
  '@/lib/brand-operations/service': {
    getPrincipalTeam: async(id:string)=>{assert.equal(id,'b');return {candidates:[],current:[],version:'v'}},
    changePrincipal: async(a:any,id:string,body:any,db:any,fromCrew:boolean)=>{assert.equal(a,actor);assert.equal(id,'b');assert.equal(fromCrew,true);assert.equal(db,undefined);assert.equal(body.principalId,'lead');assigned=true;return {ok:true}},
  },
})
const context={params:Promise.resolve({id:'b'})}
const request=()=>new Request('http://localhost/api/admin/brands/b/principal',{method:'PATCH',body:JSON.stringify({principalId:'lead',expectedVersion:'v'})})
assert.equal((await route.GET(request(),context)).status,401)
assert.equal((await route.PATCH(request(),context)).status,401)
actor={globalRoles:['AMC_PRINCIPAL']}
assert.equal((await route.GET(request(),context)).status,403)
assert.equal((await route.PATCH(request(),context)).status,403)
actor={globalRoles:['ADMIN']};trusted=false
assert.equal((await route.PATCH(request(),context)).status,403);assert(!assigned)
trusted=true
assert.equal((await route.GET(request(),context)).status,200)
assert.equal((await route.PATCH(request(),context)).status,200);assert(assigned)

// Execute the actual general brand PATCH: ordinary saves preserve PRINCIPAL,
// removal conflicts roll back the preceding brand/legacy-link writes.
let state:any, failBrandAudit=false
function reset(){state={brand:{id:'b',ownerId:'owner',name:'Before'},members:[{id:'m1',userId:'owner',role:'OWNER',active:true,updatedAt:'2026-09-21T00:00:00Z'},{id:'m2',userId:'lead',role:'PRINCIPAL',active:true,updatedAt:'2026-09-21T00:00:00Z'},{id:'m3',userId:'editor',role:'EDITOR',active:true,updatedAt:'2026-09-21T00:00:00Z'}],audit:[]}}
reset()
const tx:any={
 brand:{update:async({data}:any)=>Object.assign(state.brand,data),findUnique:async()=>state.brand,findFirst:async()=>({...state.brand,crew:{id:'crew',members:structuredClone(state.members)}})},
 brandAgent:{updateMany:async()=>{},upsert:async()=>{}},
 marketingCrew:{findUnique:async()=>({id:'crew'})},
 crewMember:{findMany:async()=>state.members.filter((m:any)=>m.active),updateMany:async({where,data}:any)=>{for(const m of state.members)if(where.userId.notIn ? !where.userId.notIn.includes(m.userId) : m.active && m.role===where.role && m.userId!==where.userId.not)Object.assign(m,data)},upsert:async({where,update}:any)=>Object.assign(state.members.find((m:any)=>m.userId===where.crewId_userId.userId),update)},
 user:{findFirst:async({where}:any)=>['owner','lead','editor'].includes(where.id)?{id:where.id}:null},
 auditLog:{create:async({data}:any)=>{if(failBrandAudit && data.action==='ADMIN_BRAND_UPDATED')throw new Error('audit unavailable');state.audit.push(data)}},
}
const db={...tx,brandSubscription:{findFirst:async()=>null},user:{...tx.user,count:async({where}:any)=>where.id.in.length},$transaction:async(fn:any,opts:any)=>{assert.equal(opts.isolationLevel,'Serializable');const before=structuredClone(state);try{return await fn(tx)}catch(e){state=before;throw e}}}
const general=compile('src/app/api/admin/brands/[id]/route.ts',{
 'next/server':{NextResponse:{json}}, '@/lib/prisma':{prisma:db}, '@/lib/auth':{getSession:async()=>({user:{id:'admin',role:'ADMIN'}})},
 '@/lib/subscription/catalog':{SUBSCRIPTION_PLANS:[{id:'essential'}],getAllowedDurationsForPlan:()=>[12]},
 '@/lib/user-management/crew':{addCrewMember:async(_crew:string,id:string,role:string)=>{const m=state.members.find((m:any)=>m.userId===id);if(m){m.role=role;m.active=true}}},
 '@/lib/postfastKeyPool':{}, '@/lib/brandGrowthSync':{growthPathsForBrandPatch:()=>[]},
 '@/lib/brand-operations/service':{OperationsError,changePrincipalInTransaction}, '@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>trusted}, '@/lib/brand-operations/http':http,
})
const save=(agentIds:string[],extra:Record<string,unknown>={})=>general.PATCH(new Request('http://localhost/api/admin/brands/b',{method:'PATCH',body:JSON.stringify({name:'After',agentIds,...extra})}),context)
assert.equal((await save(['lead','editor'])).status,200)
assert.equal(state.members.find((m:any)=>m.userId==='lead').role,'PRINCIPAL')
assert.equal(state.members.find((m:any)=>m.userId==='owner').role,'OWNER')
reset();const before=structuredClone(state)
assert.equal((await save(['editor'])).status,409)
assert.deepEqual(state,before)
console.log('Admin principal: auth, origin, team mode, ordinary-save role preservation and removal rollback passed')

reset()
let input={principalId:'editor',principalVersion:assignmentVersion(state.members)}
assert.equal((await save(['lead','editor'],input)).status,200)
assert.equal(state.brand.name,'After');assert.equal(state.members.find((m:any)=>m.userId==='editor').role,'PRINCIPAL')
assert.equal(state.members.find((m:any)=>m.userId==='lead').role,'EDITOR')
reset();input={principalId:'editor',principalVersion:assignmentVersion(state.members)}
for(const extra of [{...input,principalVersion:'stale'},{...input,principalVersion:undefined},{...input,principalId:'owner'},{...input,principalId:'outsider'}]) {
 const snapshot=structuredClone(state);assert.notEqual((await save(['lead','editor'],extra)).status,200);assert.deepEqual(state,snapshot)
}
let snapshot=structuredClone(state)
assert.equal((await save(['lead'],input)).status,409);assert.deepEqual(state,snapshot)
trusted=false;assert.equal((await save(['lead','editor'],input)).status,403);assert.deepEqual(state,snapshot);trusted=true
failBrandAudit=true;assert.equal((await save(['lead','editor'],input)).status,503);assert.deepEqual(state,snapshot);failBrandAudit=false
console.log('Unified save: brand and principal commit together; invalid selection, conflict, origin and later audit failure roll back both')

const { buildAdminBrandPatch } = await import('../src/lib/admin-brand-patch.ts')
const record:any={id:'b',name:'Brand',location:'SG',timezone:'Asia/Singapore',status:'ACTIVE',owners:[],brandAgents:[{agentId:'lead'}],subscriptions:[{planId:'essential',status:'ACTIVE',durationMonths:12,feeWaived:false,contractStartDate:'2026-01-01',contractEndDate:'2027-01-01'}]}
const draft:any={name:'Brand',location:'SG',timezone:'Asia/Singapore',status:'ACTIVE',ownerUserId:'',agentIds:['lead'],planId:'essential',subscriptionStatus:'ACTIVE',durationMonths:12,feeWaived:false,principalId:'editor',principalVersion:'v'}
assert.deepEqual(buildAdminBrandPatch(record,draft),{principalId:'editor',principalVersion:'v'})
assert.equal(buildAdminBrandPatch(record,{...draft,feeWaived:true}).contractEndDate,'2027-01-01')
assert(!('planId' in buildAdminBrandPatch({...record,subscriptions:[]},{...draft,planId:'',subscriptionStatus:''})))
console.log('Principal-only saves do not rewrite contracts or create subscriptions')
