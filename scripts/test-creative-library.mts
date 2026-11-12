import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as contract from '../src/lib/ai-native/contract.ts'
import * as imports from '../src/lib/ai-native/library-imports.ts'
import * as storage from '../src/lib/ai-native/brainstorm-storage.ts'
import {creativeSourceScript} from '../src/lib/brand-plan/creativeSourceScript.ts'
import {eligibleBrainstormSource} from '../src/lib/ai-native/brainstorm-contract.ts'
import {creativeWorkspace} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {dislikedCreativeSources} from '../src/lib/brand-plan/creativeVisibility.ts'
import {sourceMediaLocation} from '../src/lib/brand-plan/creativeSourceMediaPolicy.ts'
let libraryRead=true,brandRead=true,write=true,active=true,disliked=false,revision='r1',contentCalls=0,audits=0,failAudit=false,emptySource=false
let beforeTransaction:(()=>void)|null=null
const rows=new Map<string,any>()
let knowledge:any={marketingSolution:{publishingCalendar:{months:{keep:[{id:'existing',planning:'Do not overwrite'}]}}}}
let queue=Promise.resolve()
const db:any={
 brandKnowledge:{upsert:async()=>({id:'knowledge'}),findUnique:async()=>structuredClone(knowledge)},
 brandMarketingSolution:{findUnique:async({where}:any)=>rows.get(where.id)||null,findFirst:async({where}:any)=>[...rows.values()].find(r=>r.brandId===where.brandId&&r.kind===where.kind&&r.period===where.period)||null,findMany:async({where}:any)=>[...rows.values()].filter(r=>r.brandId===where.brandId&&r.kind===where.kind&&(!where.status||r.status===where.status)&&(!where.period||where.period.in.includes(r.period))),create:async({data}:any)=>{const row={...data,id:data.id||'row_'+rows.size,createdAt:new Date()};assert(!rows.has(row.id));rows.set(row.id,row);return row}},
 auditLog:{create:async()=>{if(failAudit)throw Error('audit_failed');audits++}},$queryRaw:async()=>[],
 $transaction:async(fn:any)=>{const run=queue.then(async()=>{if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;hook()}const before=new Map(rows);try{return await fn(db)}catch(e){rows.clear();for(const [k,v] of before)rows.set(k,v);throw e}});queue=run.then(()=>{},()=>{});return run}
}
const raw=()=>({creativeId:'cre_text',sourceRevision:revision,sourceDigest:'a'.repeat(64),scriptKind:'copy',title:'All brands script',platform:'douyin',tags:[],scriptContent:{kind:'post',originalText:emptySource?'':'Post script'},sourceEvidence:{scope:'source_unavailable',originalText:emptySource?'':'Post script'},timeline:[],originalVideoUrl:null})
const load=async(action:string)=>{contentCalls++;if(!active)throw contract.nativeError('library_source_unavailable',404);return action==='search'?{page:1,total:1,totalPages:1,items:[{...raw(),hasVideo:false}]}:raw()}
const deps:any={'./prisma':{prisma:db},'./ai-native/brainstorm':{authorizeBrainstorm:async(_u:string,b:string,w:boolean)=>{if(!brandRead||b==='forbidden')throw contract.nativeError('brainstorm_access_denied',404);if(w&&!write)throw contract.nativeError('creative_edit_forbidden',403);return {user:{},canDecide:write,canSearchLibrary:libraryRead}}},'./ai-native/contract':contract,'./brand-plan/creativeVisibility':{readDislikedCreativeSources:async()=>new Set(disliked?['cre_text']:[])},'./ai-native/brainstorm-storage':storage,'./ai-native/library-imports':imports,'./promotion-strategy/clients':{contentLibraryRequest:load,fetchCreativeSourceThumbnail:async()=>new Response('thumbnail')},'./brand-plan/creativeSourceScript':{creativeSourceScript},'./brand-plan/creativeSourceMedia':{streamSourceVideoMedia:async()=>new Response('video')}}
deps['./user-management/brandAccess']={canUserAccessBrand:async()=>brandRead&&write}
deps['./brand-plan/creativeRevisionContract']={creativeWorkspace}
deps['./brand-plan/creativeSourceMediaPolicy']={sourceMediaLocation}
deps['./brand-plan/creativeVisibility']={readDislikedCreativeSources:async(_db:any,_brand:string,workspace:any)=>new Set([...dislikedCreativeSources(workspace),...(disliked?['cre_text']:[])])}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/creative-library.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(deps[key],key);return deps[key]},mod,mod.exports)
const api=mod.exports,body={sourceId:'cre_text',sourceRevision:'r1',sourceDigest:'a'.repeat(64)},before=structuredClone(knowledge)
libraryRead=false;await assert.rejects(()=>api.searchCreativeLibrary('u','brand','',1,db,load),{code:'library_access_denied'});assert.equal(contentCalls,0)
libraryRead=true;await assert.rejects(()=>api.searchCreativeLibrary('u','forbidden','',1,db,load),{code:'brainstorm_access_denied'})
write=false;const read=await api.searchCreativeLibrary('u','brand','',1,db,load);assert.equal(read.canAdd,false);await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'creative_edit_forbidden'})
write=true;disliked=true;await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_source_disliked'});assert.equal(rows.size,0)
disliked=false
knowledge={brandPlan:{publishingCalendar:{months:{legacy:[{inspirationCreativeId:'cre_text',brandDismissal:{decision:'dislike',sourceId:'cre_text'}}]}}},marketingSolution:{}}
assert.equal((await api.searchCreativeLibrary('u','brand','',1,db,load)).items[0].blocked,true)
assert.equal((await api.readCreativeLibrary('u','brand','cre_text',db,load)).blocked,true)
await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_source_disliked'});assert.equal(rows.size,0)
knowledge=structuredClone(before)
emptySource=true;assert.equal((await api.readCreativeLibrary('u','brand','cre_text',db,load)).blocked,true)
await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_source_empty'});assert.equal(rows.size,0);emptySource=false
revision='r2';await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'creative_source_changed'});assert.equal(rows.size,0)
revision='r1';active=false;await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_source_unavailable'});active=true
await assert.rejects(()=>api.addCreativeLibrary('u','brand',{...body,matchScore:100},db,load),{code:'invalid_library_source'})
beforeTransaction=()=>{libraryRead=false};await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_access_denied'});assert.equal(rows.size,0);libraryRead=true
beforeTransaction=()=>{revision='r2'};await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'creative_source_changed'});assert.equal(rows.size,0);revision='r1'
failAudit=true;await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),/audit_failed/);assert.equal(rows.size,0);failAudit=false
await storage.storeBrainstormSources(db,'brand','other-user',[{inspirationCreativeId:'cre_text',sourceRevision:'r1',sourceDigest:body.sourceDigest,matchScore:90,matchingPolicy:'fixed-keywords-v2',sourceEvidence:{originalText:'Post script'},scriptContent:{kind:'post'}}])
const results=await Promise.all([api.addCreativeLibrary('u','brand',body,db,load),api.addCreativeLibrary('u','brand',body,db,load)])
assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(audits,1);assert.deepEqual(knowledge,before,'import must never alter calendar or edited scripts')
const afterCommitCalls=contentCalls
active=false;revision='r2'
assert.equal((await api.addCreativeLibrary('u','brand',body,db,load)).replayed,true,'lost-response retry confirms the committed pin even after source withdrawal or revision')
assert.equal(contentCalls,afterCommitCalls);assert.equal(audits,1)
await assert.rejects(()=>api.addCreativeLibrary('u','brand',{...body,sourceRevision:'r2'},db,load),{code:'creative_source_changed'},'a different source pin must not be acknowledged as the imported version')
disliked=true;await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'library_source_disliked'});disliked=false
active=true;revision='r1'
const manual=await imports.importedSource(db,'brand','cre_text');assert(eligibleBrainstormSource(manual));assert.equal(manual.matchScore,null);assert.equal(creativeSourceScript(manual),'Post script')
assert.equal((await imports.importedSources(db,'brand')).length,1)
assert.equal((await api.searchCreativeLibrary('other-user','brand','',1,db,load)).items[0].imported,true,'brand import is shared across users')
assert.equal((await api.readCreativeLibrary('other-user','brand','cre_text',db,load)).originalScript,'Post script')
await api.addCreativeLibrary('u','second-brand',body,db,load);assert.equal((await imports.importedSources(db,'second-brand')).length,1)
libraryRead=false;await assert.rejects(()=>api.readCreativeLibrary('u','brand','cre_text',db,load),{code:'library_access_denied'});libraryRead=true
brandRead=false;await assert.rejects(()=>api.addCreativeLibrary('u','brand',body,db,load),{code:'brainstorm_access_denied'})
console.log('PASS library permissions, cross-brand denial, withdrawn/stale/disliked sources, shared persistence, copy evidence and concurrent idempotency')
