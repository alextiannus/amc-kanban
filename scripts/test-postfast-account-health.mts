import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { postfastAccountHealthError } from '../src/lib/postfastAccountHealth.ts'
function compile(path:string,deps:Record<string,unknown>){const m={exports:{} as any};const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)((name:string)=>{assert(name in deps,name);return deps[name]},m,m.exports);return m.exports}
const revoked={id:'pf',platformId:'instagram',handle:'zwashsg',connectionStatus:'DISABLED',disabledReason:'TOKEN_REVOKED'}
const issue=postfastAccountHealthError(revoked)!
assert.match(issue.error,/zwashsg.*已被撤销/);assert.match(issue.error,/品牌设置重新连接/);assert.doesNotMatch(issue.error,/TOKEN_REVOKED/)
assert.match(postfastAccountHealthError({...revoked,disabledReason:'ACCOUNT_SUSPENDED'})!.error,/先在社交平台恢复账号/)
assert(postfastAccountHealthError({connectionStatus:'EXPIRED'}))
assert(postfastAccountHealthError({connectionStatus:'DISCONNECTED'}))
assert.equal(postfastAccountHealthError({connectionStatus:'CONNECTED',disabledReason:'TOKEN_REVOKED'}),null)
let remote:any=revoked,available=true,healthWrites:any[]=[]
const local={id:'local',brandId:'brand',postfastAccountId:'pf'}
class BindingError extends Error {status=409;code='ACCOUNT_UNBOUND'}
const health=compile('src/lib/postfastPublishAccount.ts',{
 './integrations/postfast.ts':{postfastFetchAccounts:async()=>available?{success:true,accounts:[remote]}:{success:false,error:'unavailable'}},
 './socialAccountBinding.ts':{resolveLocalPublishAccount:async()=>({local,remote}),withBoundAccount:async(_id:string,work:Function)=>work(local,{socialAccount:{update:async({data}:any)=>healthWrites.push(data)}}),SocialAccountBindingError:BindingError},
 './socialAccountIdentity.ts':{providerForLocal:()=>remote}, './postfastAccountHealth.ts':{postfastAccountHealthError},
}).checkPostfastPublishAccount
const input={apiKey:'mock-only',brandId:'brand',accountId:'local',platform:'instagram'}
assert.equal((await health(input)).status,409);assert.equal(healthWrites.at(-1).disabledReason,'TOKEN_REVOKED')
remote={...revoked,connectionStatus:'CONNECTED',disabledReason:undefined}
assert.equal((await health(input)).success,true);assert.equal(healthWrites.at(-1).disabledReason,null)
available=false;assert.equal((await health(input)).status,503);available=true

let state:any, deleted=0,writes=0,checks=0,allow=false,resubmitMode='success'
function reset(){state={id:'draft',brandId:'brand',accountId:'local',caption:'Keep this draft',gbpLocationId:null,status:'scheduled',scheduledAt:new Date('2026-10-01T00:00:00Z'),platformPostId:'old-post',publishedAt:null,updatedAt:new Date()};deleted=0;writes=0;checks=0}
const prisma:any={
 contentDraft:{findFirst:async()=>({...state}),findUnique:async()=>({...state}),findUniqueOrThrow:async()=>({...state}),update:async({data}:any)=>{writes++;for(const[k,v]of Object.entries(data))if(v!==undefined)state[k]=v;return {...state}}},
 socialAccount:{findFirst:async()=>({platformId:'instagram'})},brand:{findUnique:async()=>({postfastApiKey:'mock-only',timezone:'Asia/Singapore'})},
 $transaction:async(work:Function)=>work(prisma),
}
const route=compile('src/app/api/brands/[id]/drafts/[draftId]/route.ts',{
 'next/server':{NextResponse:{json:(data:any,init:any)=>Response.json(data,init)}},
 '@/lib/auth':{getSession:async()=>({user:{id:'operator',type:'HUMAN',role:'ADMIN'}}),extractApiKey:()=>null},
 '@/lib/prisma':{prisma},'@/lib/brandAccess':{canSessionAccessBrandProject:async()=>true},
 '@/lib/integrations/huaweiObs':{persistDraftSnapshotToObs:async()=>{}},'@/lib/compliance':{parseBrandComplianceConfig:async()=>null},
 '@/lib/audit':{},'@/lib/events':{},'@/lib/postfastDelivery':{},
 '@/lib/postfastPublishAccount':{checkPostfastPublishAccount:async()=>{checks++;return allow?{success:true}:{success:false,status:409,...issue}}},
 '@/lib/integrations/postfast':{postfastDeletePost:async()=>{deleted++;return {success:true}}},
 '@/lib/draftSubmission':{submitDraftForDelivery:async()=>{
   if(resubmitMode==='throw')throw Error('provider unavailable')
   if(resubmitMode==='fail'){state.status='failed';return {ok:false,status:409,...issue}}
   state.status='scheduled';state.platformPostId='new-post';return {ok:true,draft:{...state},mode:'scheduled'}
 }},
})
async function patch(body:any){return route.PATCH(new Request('http://localhost/api/brands/brand/drafts/draft',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:'brand',draftId:'draft'})})}
reset();const previous=structuredClone(state);let r=await patch({scheduledAt:'2026-10-02T00:00:00Z'});assert.equal(r.status,409);assert.equal(deleted,0);assert.equal(writes,0);assert.deepEqual(state,previous)
// Cancellation alone and ordinary editing must remain available for disabled accounts.
reset();r=await patch({status:'draft'});assert.equal(r.status,200);assert.equal(checks,0);assert.equal(deleted,1)
reset();state.platformPostId=null;r=await patch({scheduledAt:'2026-10-02T00:00:00Z'});assert.equal(r.status,200);assert.equal(checks,0)
reset();allow=true;r=await patch({scheduledAt:'2026-10-02T00:00:00Z'});assert.equal(r.status,200);assert.equal(deleted,1);assert.equal((await r.json()).draft.platformPostId,'new-post')
reset();resubmitMode='fail';r=await patch({scheduledAt:'2026-10-02T00:00:00Z'});assert.equal(r.status,409);const failed=await r.json();assert.equal(failed.ok,false);assert.equal(failed.draft.status,'failed');assert.equal(failed.draft.platformPostId,null)
reset();resubmitMode='throw';r=await patch({scheduledAt:'2026-10-02T00:00:00Z'});assert.equal(r.status,502);assert.equal((await r.json()).ok,false)
console.log('PASS: revoked/expired/disconnected health, recovery clears cached failure, outage fails closed, actual draft PATCH preserves old schedule, cancellation/edit still work, successful requeue and failed requeue status')

// The submission path must not reject a reconnected account based on its stale DB snapshot.
let submitAllowed=false,submitDeletes=0
const submit=compile('src/lib/draftSubmission.ts',{
 '@/lib/prisma':{prisma:{brand:{findUnique:async()=>({id:'brand',autoPilot:true,postfastApiKey:'mock-only'})},contentDraft:{findFirst:async()=>({id:'draft',caption:'Real post',accountId:'local',platformPostId:'old-post',account:{id:'local',platformId:'instagram',handle:'zwashsg',connectionStatus:'DISABLED',disabledReason:'TOKEN_REVOKED'}})}}},
 '@/lib/postfastPublishAccount':{checkPostfastPublishAccount:async()=>submitAllowed?{success:true}:{success:false,status:409,...issue}},
 '@/lib/integrations/postfast':{postfastDeletePost:async()=>{submitDeletes++;throw Error('reached-cancel-after-live-check')}},
 '@/lib/socialAccountBinding':{},'@/lib/integrations/huaweiObs':{},'@/lib/schedulingRecommendation':{},'@/lib/publishMedia':{},
 '@/lib/publishMediaValidation':{validateDraftMediaForPlatform:async()=>[]},
 '@/lib/mediaPublishPolicy':{shouldValidateMediaForDraftDelivery:()=>true},
 '@/lib/mediaValidation':{blockingMediaIssues:()=>[],mediaValidationWarnings:()=>[]},
 '@/lib/audit':{},'@/lib/syncDraftStatuses':{POSTFAST_RESULT_UNKNOWN:'POSTFAST_RESULT_UNKNOWN'},'@/lib/postfastDelivery':{},'@/lib/postfastDeliveryPolicy':{},
}).submitDraftForDelivery
const result=await submit({brandId:'brand',draftId:'draft',actorId:'operator'})
assert.equal(result.code,'POSTFAST_ACCOUNT_DISABLED');assert.match(result.error,/品牌设置重新连接/);assert.equal(submitDeletes,0)
submitAllowed=true
await assert.rejects(submit({brandId:'brand',draftId:'draft',actorId:'operator'}),/reached-cancel-after-live-check/)
assert.equal(submitDeletes,1)
console.log('PASS: actual submission preserves old remote post on revoked authorization; reconnected account is no longer blocked by stale cached TOKEN_REVOKED')
