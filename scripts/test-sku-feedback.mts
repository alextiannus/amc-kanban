import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as workspace from '../src/lib/brand-plan/creativeWorkspaceContract.ts'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
const compile=(path:string,deps:any)=>{
  const mod={exports:{} as any}
  new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,`Unexpected import ${key}`);return deps[key]},mod,mod.exports)
  return mod.exports
}
const actor={id:'human',type:'HUMAN'},month='2026-11',brandId='brand',creativeId='idea'
let allowed=true,edit=true,auditFailure=false,locks=0,sourceUnavailable=false,sourceReads=0
let catalog=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'c',name:'Gamma'}]
const source:any={inspirationCreativeId:'cre_source',sourceRevision:'source-v1',sourceDigest:'a'.repeat(64),evidenceStatus:'full_source',timeline:[{id:'shot-1',order:1},{id:'shot-2',order:2}]}
let item:any={id:creativeId,title:'Original',planning:'Original',status:'idea_pending',platformTargets:['instagram'],materialRequirements:[],inspirationCreativeId:'cre_source'}
let knowledge:any={marketingSolution:{publishingCalendar:{months:{[month]:[item]}}}},rows:any[]=[],audits:any[]=[]
const facts=()=>({id:brandId,name:'Brand',knowledge:{menuItems:catalog}})
const tx:any={
  $queryRaw:async()=>{locks++;return []},
  user:{findUnique:async()=>({id:actor.id,nickname:'Human',status:'ACTIVE',type:'HUMAN',role:'USER',businessRoles:[]})},
  brand:{findUnique:async()=>({id:brandId,name:'Brand',crew:{id:'crew',members:[]}})},
  brandKnowledge:{findUnique:async()=>structuredClone(knowledge),update:async({data}:any)=>{knowledge=structuredClone({...knowledge,...data});return knowledge}},
  brandMarketingSolution:{findFirst:async({where}:any)=>{
    const filtered=rows.filter(r=>r.brandId===where.brandId&&r.kind===where.kind&&(!where.period||r.period===where.period)&&(!where.input||r.input.requestKey===where.input.equals))
    return filtered.at(-1)||null
  },findMany:async({where}:any)=>rows.filter(r=>r.brandId===where.brandId&&(!where.id||r.id===where.id)).toReversed(),create:async({data}:any)=>{const row={...structuredClone(data),id:`rev-${rows.length}`,createdAt:new Date()};rows.push(row);return row}},
  auditLog:{create:async({data}:any)=>{if(auditFailure)throw Error('audit failure');audits.push(data);return data}},
}
let queue=Promise.resolve()
const db:any={$transaction:async(fn:any)=>{
  const previous=queue;let release:any;queue=new Promise(resolve=>release=resolve);await previous
  const snapshot=structuredClone({knowledge,rows,audits})
  try{return await fn(tx)}catch(e){({knowledge,rows,audits}=snapshot);throw e}finally{release()}
}}
Object.assign(db,tx)
const revision=compile('src/lib/brand-plan/creativeRevisions.ts',{
  './matchingContract':{},'./revisionFeedback':await import('../src/lib/brand-plan/revisionFeedback.ts'),'../ai-native/creative-diversity.ts':{},'../prisma.ts':{prisma:{}},
  '../ai-native/facts.ts':{readBrandFacts:async()=>facts()},'node:crypto':await import('node:crypto'),
  '../role-permissions/store.ts':{readPolicies:async()=>({policies:{EDITOR:[]}})},'../role-permissions/contract.ts':{effectiveGrants:()=>edit?['draft.update']:[]},'../auth-v2/types.ts':{principalFromUser:()=>({globalRoles:[],permissionRoleIds:['EDITOR']})},
  '../user-management/brandAccess.ts':{canUserAccessBrand:async(brand:string)=>allowed&&brand===brandId},'./creativeRevisionContract.ts':contract,'./creativeWorkspaceContract.ts':workspace,'./creativeCollections.ts':{},'./creativeSkuContract':sku,
})
const decision=compile('src/lib/brand-plan/creativeSkuDecision.ts',{'../prisma':{prisma:db},'../ai-native/facts':{readBrandFacts:async()=>facts()},'./creativeRevisions':revision,'./creativeSource':{readCreativeSource:async()=>{sourceReads++;if(sourceUnavailable)throw new contract.CreativeRevisionError('content_unavailable',503);return source}},'./creativeRevisionContract':contract,'./creativeSkuContract':sku})
const current=()=>knowledge.marketingSolution.publishingCalendar.months[month][0]
const hash=()=>contract.creativeDigest(current())
const input=(key:string)=>({month,idempotencyKey:key,catalogDigest:sku.catalogDigest(sku.skuCatalog(facts())),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest,selectedSkuIds:['a','b'],recommendations:catalog.slice(0,2).map(s=>({skuId:s.id,skuName:s.name,roles:['hero'],rationale:'Product fits action',sourceShotIds:['shot-1']})),adjustmentNote:'Choose this mix'})
const before=hash(),request=input('confirm-first')
const first=await decision.saveSkuDecision(actor,brandId,creativeId,before,request,db)
assert.equal(first.receipt.content.skuDecision.decidedBy,actor.id)
assert.equal(first.receipt.content.skuDecision.status,'adjusted')
assert.equal(first.receipt.content.planning,'Original')
assert.equal(rows.length,2);assert.equal(audits.length,1);assert(locks>0)
sourceUnavailable=true;const readsAfterSave=sourceReads
const replay=await decision.saveSkuDecision(actor,brandId,creativeId,before,{...request,adjustmentNote:'  Choose this mix  '},db)
assert(replay.replayed);assert.equal(rows.length,2)
assert.equal(replay.receipt.id,first.receipt.id);assert.equal(sourceReads,readsAfterSave,'lost-response replay does not consult unavailable Content')
await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,before,{...request,adjustmentNote:'Different'},db),/creative_request_key_reused/)
assert.equal(sourceReads,readsAfterSave)
sourceUnavailable=false
await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,before,input('stale-request'),db),/creative_revision_conflict/)
await assert.rejects(()=>decision.saveSkuDecision(actor,'other-brand',creativeId,hash(),input('cross-brand'),db),/creative_access_denied/)
await assert.rejects(()=>decision.saveSkuDecision({id:'ai',type:'AI'},brandId,creativeId,hash(),input('ai-request'),db),/human_sku_confirmation_required/)
const staleCatalog=input('deleted-sku');catalog=catalog.filter(s=>s.id!=='a')
await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,hash(),staleCatalog,db),/sku_catalog_changed/)
catalog=[{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'c',name:'Gamma'}]
edit=false;await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,hash(),input('no-edit-role'),db),/creative_edit_forbidden/);edit=true
allowed=false;await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,hash(),input('revoked-user'),db),/creative_access_denied/);allowed=true
const concurrentHash=hash(),pair=await Promise.allSettled(['concurrent-a','concurrent-b'].map(key=>decision.saveSkuDecision(actor,brandId,creativeId,concurrentHash,input(key),db)))
assert.equal(pair.filter(p=>p.status==='fulfilled').length,1)
assert.match((pair.find(p=>p.status==='rejected') as PromiseRejectedResult).reason.message,/creative_revision_conflict/)
const savedHash=hash(),savedRows=rows.length,savedAudits=audits.length
auditFailure=true;await assert.rejects(()=>decision.saveSkuDecision(actor,brandId,creativeId,savedHash,input('audit-rollback'),db),/audit failure/);auditFailure=false
assert.equal(hash(),savedHash);assert.equal(rows.length,savedRows);assert.equal(audits.length,savedAudits)
// Route authorization and explicit error semantics against the real handler.
let auth:any=null,origin=true
const route=compile('src/app/api/brands/[id]/content-creatives/[creativeId]/sku-decision/route.ts',{'@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth},'@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin},'@/lib/brand-plan/creativeRevisionContract':contract,'@/lib/brand-plan/creativeSkuDecision':decision})
const ctx={params:Promise.resolve({id:brandId,creativeId})},http=(body:any)=>new Request(`https://localhost/api/brands/brand/content-creatives/idea/sku-decision?month=${month}`,{method:'POST',body:JSON.stringify(body)})
assert.equal((await route.POST(http({}),ctx)).status,401)
auth={user:actor};origin=false;assert.equal((await route.POST(http({}),ctx)).status,403);origin=true
assert.equal((await route.POST(http({expectedRevision:hash(),...input('route-valid')}),ctx)).status,200)
assert.equal((await route.POST(http({expectedRevision:hash(),...input('route-forged'),decidedBy:'forged'}),ctx)).status,400)
assert.equal((await route.GET(http({}),ctx)).headers.get('cache-control'),'no-store')
console.log('PASS SKU service: trusted human, catalog/source CAS, replay, concurrent lock, role/revocation, audit rollback and route')
