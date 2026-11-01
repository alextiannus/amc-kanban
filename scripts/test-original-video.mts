import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {createHash} from 'node:crypto'
import {originalVideoRequest,originalVideoBrief} from '../src/lib/originalVideoBrief'
import {requestedVideoCraft,requireVideoSkill} from '../src/lib/ai-native/video-rewrite'
const input={action:'create',tagIds:['tag_food','tag_story','tag_food'],language:'zh',requestKey:'original-test-request-1'}
const parsed=originalVideoRequest(input),tags=[{id:'tag_food',label:'招牌菜'},{id:'tag_story',label:'剧情'}]
assert.deepEqual(parsed.tagIds,['tag_food','tag_story'])
assert.throws(()=>originalVideoRequest({...input,tagIds:['unknown']}))
assert.throws(()=>originalVideoBrief(parsed,[]),/keywords_changed/)
const brief=originalVideoBrief(parsed,tags),required=requestedVideoCraft(brief.instructions)
for(const name of ['video-screenwriting.md','video-storyboard.md','video-brand-voice.md'])assert(required.includes('references/'+name))
assert.throws(()=>requireVideoSkill([],brief.instructions))
const rows=new Map<string,any>();let count=0,allowed=true,keywordReads=0
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const db:any={brand:{findUnique:async()=>({name:'Brand',knowledge:{}})},brandMarketingSolution:{findUnique:async({where}:any)=>rows.get(where.id)||null,create:async({data}:any)=>{rows.set(data.id,data);return data},upsert:async({where,create}:any)=>{if(!rows.has(where.id))rows.set(where.id,create);return rows.get(where.id)},update:async({where,data}:any)=>{Object.assign(rows.get(where.id),data);return rows.get(where.id)}},$queryRaw:async()=>[], $transaction:async(fn:any)=>fn(db)}
const nativeError=(s:string,n=400)=>Object.assign(Error(s),{statusCode:n})
const deps:any={
 './originalVideoBrief':{originalVideoRequest,originalVideoBrief},'./promotion-strategy/clients':{fetchBrandKeywords:async()=>{keywordReads++;return {tags}}},'./ai-native/brainstorm-match':{brainstormTagContext:(f:any)=>f},'./ai-native/video-rewrite':{videoRewriteEnabled:()=>false},'./brand-plan/creativeSourceScript':{creativeSourceScript:()=>''},'./prisma':{prisma:db},'./ai-native/brainstorm':{authorizeBrainstorm:async()=>{if(!allowed)throw nativeError('denied',403)}},'./brand-plan/creativeSource':{readCreativeSource:async()=>{throw Error('unexpected source read')}},'./ai-native/facts':{readVideoRewriteFacts:async()=>({name:'Brand',productCatalog:[]})},'./videoRewriteSkill':{readVideoRewriteSkill:async()=>{throw Error('legacy must not run')}},'./llmRouter':{callLLM:async()=>{throw Error('legacy model must not run')}},'./brand-plan/creativeRevisionContract':{creativeDigest:digest},'./videoPlatformVersions':{},'./ai-native/contract':{nativeError},'./ai-native/service':{createNativeTask:async(_u:string,_b:string,body:any)=>{count++;assert.equal(body.kind,'video_rewrite');assert(requestedVideoCraft(body.goal).includes('references/video-screenwriting.md'));return {id:'task-'+count}},readNativeTask:async()=>({status:'succeeded',report:{script:'已审稿的剧本',durationSec:30,language:'zh'}})}
}
const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/videoPreparation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports)
const run=mod.exports.prepareVideoScript
const a=await run('user','brand',input);assert.equal(a.status,'ready');assert.equal(count,1)
assert.deepEqual(await run('user','brand',input),a);assert.equal(count,1);assert.equal(keywordReads,1,'resume reuses frozen brief')
await assert.rejects(()=>run('user','brand',{...input,tagIds:[]}),/conflict/)
const follow={action:'create_revision',rootRequestKey:input.requestKey,requestKey:'follow-up-request-1',script:'人工最新稿',instructions:'结尾不要广告腔',language:'zh',editorRevision:'manual-v2',targetDurationSec:30}
assert.equal((await run('user','brand',follow)).status,'ready');assert.equal(count,2)
await assert.rejects(()=>run('other','brand',follow),/not_found/)
allowed=false;await assert.rejects(()=>run('user','brand',input),/denied/);assert.equal(count,2)
console.log('PASS original creation: canonical tags, required craft modules, native path outside rollout, frozen brief, replay, current-script refinement, owner scope and permission recheck')
