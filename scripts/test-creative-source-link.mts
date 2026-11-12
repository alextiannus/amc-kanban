import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/ai-native/brainstorm-contract.ts'
import * as context from '../src/lib/ai-native/brainstorm-context.ts'
import * as imports from '../src/lib/ai-native/library-imports.ts'
import * as storage from '../src/lib/ai-native/brainstorm-storage.ts'
import * as visibility from '../src/lib/brand-plan/creativeVisibility.ts'
import * as revisions from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as sourceEvidence from '../src/lib/brand-plan/creativeSourceEvidence.ts'
import * as sourceLink from '../src/lib/brand-plan/creativeSourceLink.ts'
import * as usage from '../src/lib/ai-native/brainstorm-usage.ts'
import * as policies from '../src/lib/role-permissions/contract.ts'
import * as principals from '../src/lib/auth-v2/types.ts'
import {nativeError} from '../src/lib/ai-native/contract.ts'
import {resolveBrainstormVideos} from '../src/lib/ai-native/brainstorm-video.ts'
import {kanbanRoutePermission} from '../src/lib/role-permissions/routes.ts'
import {originalLinkPolicyAdditions} from '../src/lib/role-permissions/original-link-rollout.ts'

const hash='a'.repeat(64),partTime='role_verified_part_time_42'
let roles=['AMC_PRINCIPAL'],disabled=false,active=true,allowed=true,rows:any[]=[],items:any[]=[],evidenceReads=0
let raw:any={creativeId:'cre_one',sourceRevision:'r1',sourceDigest:hash,originalPostUrl:'https://social.example/post/one',originalVideoUrl:'https://media.example/one.mp4'}
const source={inspirationCreativeId:'cre_one',sourceRevision:'r1',sourceDigest:hash,matchScore:90}
const matches=(row:any,where:any)=>Object.entries(where).every(([k,v]:any)=>k==='input'?row.input?.decision===v.equals:k==='period'&&typeof v==='object'?v.in.includes(row[k]):row[k]===v)
const db:any={
 user:{findUnique:async()=>({id:'user',role:'USER',type:'HUMAN',status:active?'ACTIVE':'INACTIVE',businessRoles:roles.map(role=>({role}))})},
 brandKnowledge:{findUnique:async()=>({marketingSolution:{publishingCalendar:{months:{'2026-11':items}}}})},
 brandMarketingSolution:{findFirst:async({where}:any)=>rows.find(r=>matches(r,where))||null,findMany:async({where}:any)=>rows.filter(r=>matches(r,where)),findUnique:async({where}:any)=>rows.find(r=>r.id===where.id)||null},
}
const load=(file:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key]||{},mod,mod.exports);return mod.exports}
const deps:any={
 './library-imports':imports,'./brainstorm-context':context,'./brainstorm-storage':storage,'./brainstorm-contract':contract,'./brainstorm-usage':usage,
 '../prisma':{prisma:db},'../brand-plan/creativeSourceLink':sourceLink,'../brand-plan/creativeSourceEvidence':sourceEvidence,'../brand-plan/creativeRevisionContract':revisions,'../brand-plan/creativeVisibility':visibility,
 '../role-permissions/contract':policies,'../auth-v2/types':principals,'./contract':{nativeError},
 '../role-permissions/store':{readPolicies:async()=>({policies:{...Object.fromEntries(policies.POLICY_ROLES.map(id=>[id,policies.defaultGrants(id)])),[partTime]:disabled?[]:['brand.read','draft.read','draft.view-source-link'],editor:['brand.read','draft.read','draft.update','content.inspiration-library.read']}})},
 '../user-management/brandAccess':{canUserAccessBrand:async(brandId:string)=>allowed&&brandId==='brand'},
}
const service=load('src/lib/ai-native/brainstorm.ts',deps)
const read=async()=>{evidenceReads++;return structuredClone(raw)}
const call=(input:any={sourceDigest:hash},brand='brand',fetcher:any=read)=>service.brainstormSourceLink('user',brand,'cre_one',input,db,fetcher)
const reject=(code:string,input?:any,brand?:string,fetcher?:any)=>assert.rejects(call(input,brand,fetcher),(e:any)=>e.code===code)
const resetFeed=()=>{items=[];rows=[{brandId:'brand',kind:'BRAINSTORM_FEED',period:'sources',input:{},output:{sources:[structuredClone(source)]},createdAt:new Date()}]}
resetFeed()
for(const assigned of [['AMC_PRINCIPAL'],[partTime],['ADMIN']]){roles=assigned;assert.deepEqual(await call(),{url:raw.originalPostUrl})}
for(const assigned of [['BRAND_OWNER'],['editor'],['BD'],['RESEARCHER']]){roles=assigned;const before=evidenceReads;await reject('creative_source_link_forbidden');assert.equal(evidenceReads,before)}
roles=[partTime];disabled=true;await reject('creative_source_link_forbidden');disabled=false
active=false;await reject('brainstorm_access_denied');active=true
await reject('brainstorm_access_denied',undefined,'foreign');allowed=false;await reject('brainstorm_access_denied');allowed=true
await reject('invalid_brainstorm_request',{sourceDigest:'bad'})
await reject('creative_source_changed',{sourceDigest:'b'.repeat(64)})
raw.sourceRevision='r2';await reject('creative_source_changed');raw.sourceRevision='r1'
await reject('creative_source_unavailable',undefined,undefined,async()=>{throw Error('network')})
await reject('creative_source_not_found',undefined,undefined,async()=>{throw Error('original_evidence_not_found')})
for(const originalPostUrl of [null,'javascript:alert(1)','data:text/html,test','//social.example/post','https://user:secret@social.example/post','https://social.example/\npost','https:\\social.example/post']){raw.originalPostUrl=originalPostUrl;await reject('creative_source_link_missing')}
raw.originalPostUrl=null;raw.sourceVideo={sourceUrl:'https://social.example/video/one'};assert.equal((await call()).url,raw.sourceVideo.sourceUrl)
delete raw.sourceVideo;raw.sourcePost={sourceUrl:'https://social.example/post/one'};assert.equal((await call()).url,raw.sourcePost.sourceUrl);delete raw.sourcePost
raw.originalPostUrl='https://social.example/post/one'
// Policy and brand revocations during the external read must be honored.
await reject('creative_source_link_forbidden',undefined,undefined,async()=>{disabled=true;return raw});disabled=false
await reject('brainstorm_access_denied',undefined,undefined,async()=>{allowed=false;return raw});allowed=true
// Saved creative identity is resolved inside the brand, including legacy canonical sources.
rows=[];items=[{id:'saved',source:structuredClone(source)}]
assert.equal((await call({sourceDigest:hash,creativeId:'saved'})).url,raw.originalPostUrl)
await reject('brainstorm_source_not_found',{sourceDigest:hash,creativeId:'foreign'})
items[0].source.inspirationCreativeId='cre_other';await reject('brainstorm_source_not_found',{sourceDigest:hash,creativeId:'saved'})
items=[]
rows=[{id:imports.libraryImportId('brand','cre_one'),brandId:'brand',kind:imports.LIBRARY_IMPORT,status:'SAVED',period:'cre_one',output:{source:{...source,matchScore:null,matchingPolicy:'manual-library-v1'}}}]
assert.equal((await call()).url,raw.originalPostUrl)
rows=[{brandId:'brand',createdById:'user',kind:'CREATIVE_FAVORITE',period:'cre_one',status:'SAVED',output:{current:{source}}}]
assert.equal((await call()).url,raw.originalPostUrl)
rows[0].createdById='another-user';await reject('brainstorm_source_not_found')
rows=[]
db.$queryRaw=async(strings:TemplateStringsArray)=>strings.join('').includes('to_regclass')?[{name:'amc_iaic.brand_ideas'}]:[{source_id:'cre_one',source}]
assert.equal((await call()).url,raw.originalPostUrl)
delete db.$queryRaw
resetFeed();const ref=storage.brainstormSourceReference(source);rows[0].output.sources=[ref]
rows.push({brandId:'brand',kind:'BRAINSTORM_SOURCE',period:ref.sourceSnapshotKey,output:{source}})
assert.equal((await call()).url,raw.originalPostUrl)
resetFeed();rows.push({brandId:'brand',kind:'BRAINSTORM_DECISION',period:'cre_one',input:{decision:'dislike'}});await reject('brainstorm_source_not_found')
resetFeed()
await context.withBrainstormBrowse('user','brand','11111111-1111-4111-8111-111111111111',async()=>{rows[0].period=context.brainstormFeedPeriod('brand');assert.equal((await call()).url,raw.originalPostUrl)})
rows[0].period='browse:another-user:11111111-1111-4111-8111-111111111111';await reject('brainstorm_source_not_found')
const candidate={idea:{sourceId:'cre_one',sourceType:'manual-library'},current:{source}}
for(const video of [true,false]){
 const result=await resolveBrainstormVideos([candidate],'brand',async()=>({...raw,scriptKind:'copy',originalVideoUrl:video?raw.originalVideoUrl:null,sourceEvidence:{originalText:'A complete post script'}}))
 assert.equal(result.items[0].hasOriginalLink,true)
 assert.equal(result.items[0].sourceDigest,hash)
 assert(!JSON.stringify(result).includes(raw.originalPostUrl),'feed must never contain the raw original link')
}
assert.equal(kanbanRoutePermission('/api/brands/brand/ai/brainstorm/cre_one/source-link','GET'),'draft.view-source-link')
assert(!policies.defaultGrants('BRAND_OWNER').includes('draft.view-source-link'))
assert(policies.defaultGrants('AMC_PRINCIPAL').includes('draft.view-source-link'))
// A view-only action must not turn a role into a brand writer at legacy gates.
let gateQuery:any
const brandGate=load('src/lib/user-management/brandAccess.ts',{'../role-permissions/contract.ts':policies})
const gateDb:any={user:{findFirst:async(q:any)=>{gateQuery=q;return null}}}
const onlyView={[partTime]:['draft.read','draft.view-source-link']}
await brandGate.canUserAccessBrand('brand','user','WRITE',gateDb,onlyView)
assert(!gateQuery.where.OR[2].AND[0].businessRoles.some.role.in.includes(partTime))
await brandGate.canUserAccessBrand('brand','user','READ',gateDb,onlyView)
assert(gateQuery.where.OR[2].AND[0].businessRoles.some.role.in.includes(partTime))
assert.equal(readFileSync('src/lib/role-permissions/contract.ts','utf8'),readFileSync('../amc-content/src/permissionContract.ts','utf8'))
const snapshot={roles:[{id:'AMC_PRINCIPAL',name:'Principal',enabled:true,builtIn:true},{id:partTime,name:'Renamed part-time group',enabled:true,builtIn:false}],policies:{AMC_PRINCIPAL:['brand.read'],[partTime]:['asset.read']},versions:{AMC_PRINCIPAL:4,[partTime]:8}}
const plans=originalLinkPolicyAdditions(snapshot,partTime)
assert(plans[1].grants.includes('asset.read'));assert.equal(plans[1].expectedVersion,8);assert.deepEqual(plans[1].added,['draft.read','draft.view-source-link'])
assert.deepEqual(originalLinkPolicyAdditions({...snapshot,policies:Object.fromEntries(plans.map(p=>[p.id,p.grants]))},partTime).map(p=>p.added),[[],[]])
assert.throws(()=>originalLinkPolicyAdditions(snapshot,'BRAND_OWNER'));assert.throws(()=>originalLinkPolicyAdditions(snapshot,''))
// Exercise the actual route + nativeHttp authentication and no-store error paths.
let auth:any=null
const http=load('src/lib/ai-native/http.ts',{'../user-management/auth':{resolveSessionOrApiKey:async()=>auth},'../role-permissions/request-origin':{allowedRoleWriteOrigin:()=>true}})
const route=load('src/app/api/brands/[id]/ai/brainstorm/[sourceId]/source-link/route.ts',{'@/lib/ai-native/brainstorm-context':context,'@/lib/ai-native/http':http,'@/lib/ai-native/brainstorm':{brainstormSourceLink:(_u:string,b:string,s:string,i:any)=>{assert.equal(s,'cre_one');return call(i,b)}}})
const address='https://app.example/api/brands/brand/ai/brainstorm/cre_one/source-link?sourceDigest='+hash,ctx={params:Promise.resolve({id:'brand',sourceId:'cre_one'})}
let response=await route.GET(new Request(address),ctx);assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store')
auth={user:{id:'user',type:'AI'}};assert.equal((await route.GET(new Request(address),ctx)).status,403)
auth.user.type='HUMAN';resetFeed();response=await route.GET(new Request(address),ctx);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{url:raw.originalPostUrl})
assert.equal((await route.GET(new Request(address+'&browseSessionId=bad'),ctx)).status,400)
roles=['editor'];assert.equal((await route.GET(new Request(address),ctx)).status,403)
console.log('PASS original source links: role matrix, revocation, brand/source scope, pins, URL safety, saved/imported/favorite sources, no URL in feeds, additive role rollout, route authentication and no-store')
