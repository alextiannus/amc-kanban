import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {readVideoRewriteSkill} from '../src/lib/videoRewriteSkill'
import {creativeSourceScript} from '../src/lib/brand-plan/creativeSourceScript'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract'
const records=new Map<string,any>(),jobs=new Map<string,any>();let modelCalls=0,authorized=true,sourceReads=0,factsReads=0,lastPrompt=''
let modelOverride:any=null
let tail=Promise.resolve()
const db:any={brandMarketingSolution:{findUnique:async({where}:any)=>records.get(where.id)||null,create:async({data}:any)=>{records.set(data.id,structuredClone(data));return data},update:async({where,data}:any)=>{const value={...records.get(where.id),...data};records.set(where.id,value);return value},findMany:async({where}:any)=>[...records.values()].filter(r=>r.brandId===where.brandId&&r.kind===where.kind&&r.period===where.period&&r.createdById===where.createdById)},videoProductionJob:{findUnique:async({where}:any)=>jobs.get(where.id)||null,findFirst:async({where}:any)=>[...jobs.values()].find(j=>j.brandId===where.brandId&&j.createdBy===where.createdBy&&j.plan?._mmVideoJob?.editor?.variantKey===where.plan.equals)||null},brand:{findUnique:async()=>({location:'ID',knowledge:{market:'ID'}})},$queryRaw:async()=>[]}
db.$transaction=async(fn:any)=>{const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;try{return await fn(db)}finally{release()}}
const nativeError=(code:string,status=400)=>Object.assign(Error(code),{code,status})
function load(file:string,deps:any){const m={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{if(!(key in deps))throw Error('Unexpected dependency '+key);return deps[key]},m,m.exports);return m.exports}
const variants=load('src/lib/videoPlatformVersions.ts',{'./prisma':{prisma:db},'./role-permissions/delegation':{requireActorPermission:async()=>{}},'./brand-plan/creativeRevisionContract':{creativeDigest},'./ai-native/contract':{nativeError}})
const preparation=load('src/lib/videoPreparation.ts',{'./brand-plan/creativeSourceScript':{creativeSourceScript},'./videoRewriteSkill':{readVideoRewriteSkill},'./prisma':{prisma:db},'./videoPlatformVersions':variants,'./ai-native/brainstorm':{authorizeBrainstorm:async()=>{if(!authorized)throw nativeError('denied',403)}},'./brand-plan/creativeSource':{readCreativeSource:async()=>{sourceReads++;return {sourceDigest:'a'.repeat(64),sourceEvidence:{originalText:'发布文案 #美食'},timeline:[{visualDescription:'鱼的特写',voiceover:'新鲜现做'}]}}},'./ai-native/facts':{readVideoRewriteFacts:async()=>{factsReads++;return {name:'A brand',knowledge:{market:'ID'}}}},'./llmRouter':{callLLM:async(_task:string,prompt:string)=>{modelCalls++;lastPrompt=prompt;assert(prompt.includes('Bahasa Indonesia')||JSON.parse(prompt.split('\n').at(-1)!).language==='id');assert(prompt.includes('originalScript'));return {text:JSON.stringify(modelOverride||{script:'Adegan 1\nVisual: Ikan segar',originalScript:'Ikan asli',language:'id',durationSec:8}),provider:'fixture',modelName:'fixture'}}},'./brand-plan/creativeRevisionContract':{creativeDigest},'./ai-native/contract':{nativeError}})
const body={action:'translate',creativeId:'idea',language:'id',script:'镜头 1\n画面：鱼',requestKey:'test-translation-123'}
authorized=false;await assert.rejects(preparation.prepareVideoScript('u','b',body),/denied/);assert.equal(modelCalls,0);authorized=true
const responses=await Promise.allSettled(Array.from({length:4},()=>preparation.prepareVideoScript('u','b',body)));assert.equal(modelCalls,1);assert(responses.some(r=>r.status==='fulfilled'));assert.equal((await preparation.prepareVideoScript('u','b',body)).language,'id');assert.equal(modelCalls,1)
await assert.rejects(preparation.prepareVideoScript('u','b',{...body,script:'changed'}),/request_conflict/)
await assert.rejects(preparation.prepareVideoScript('u','b',{...body,language:'unknown'}),/invalid_video_preparation/)
jobs.set('parent',{id:'parent',brandId:'b',createdBy:'u',idea:'script',finalVideoUrl:'https://example.test/final.mp4',plan:{_mmVideoJob:{language:'zh',editor:{script:'confirmed'}}}})
await assert.rejects(variants.videoPlatformVersion('other','b',{action:'claimVariant',jobId:'parent',platform:'tiktok'}),/video_not_found/)
const plan=await variants.videoPlatformVersion('u','b',{action:'variantPlan',jobId:'parent',platform:'tiktok'});assert.equal(plan.language,'id');assert.equal(plan.reserved,false)
const claims=await Promise.all(Array.from({length:4},()=>variants.videoPlatformVersion('u','b',{action:'claimVariant',jobId:'parent',platform:'tiktok'})));assert.equal(claims.filter(c=>c.execute).length,1)
const key=claims[0].key;jobs.set('child',{id:'child',brandId:'b',createdBy:'u',status:'generating',plan:{_mmVideoJob:{editor:{variantKey:key}}}})
const recovered=await variants.videoPlatformVersion('u','b',{action:'claimVariant',jobId:'parent',platform:'tiktok'});assert.equal(recovered.jobId,'child');assert.equal(recovered.execute,false)
await variants.videoPlatformVersion('u','b',{action:'completeVariant',jobId:'parent',key,childJobId:'child'})
const list=await variants.videoPlatformVersion('u','b',{action:'variants',jobId:'parent'});assert.equal(list.versions[0].jobId,'child');assert.equal(list.versions[0].language,'id');assert.equal(modelCalls,1)
assert.equal((await variants.videoPlatformVersion('u','b',{action:'variantPlan',jobId:'parent',platform:'xiaohongshu'})).language,'zh')
assert.equal(variants.languageForMarket('SG'),'en');assert.equal(variants.languageForMarket('MY'),'ms');assert.equal(variants.languageForMarket('unknown'),null)
console.log('PASS actual script/variant services: authorization, source separation, translation receipt reuse, concurrent single admission, owned parent/child recovery, platform market language; no media provider calls')

assert(!lastPrompt.includes('Director: brand-led visual storytelling'),'translation excludes craft modules')
const context=await preparation.prepareVideoScript('u','b',{action:'context',creativeId:'idea'});assert(context.originalScript.includes('画面：鱼的特写'));assert(!context.originalScript.includes('#美食'));

assert.equal(factsReads,0,'context and translation must not load full brand facts')
const edited='User edited text stays byte-for-byte unchanged.  '
const beforeOriginal=modelCalls
const originalResult=await preparation.prepareVideoScript('u','b',{...body,originalOnly:true,script:edited,requestKey:'original-only-test-123'})
assert.equal(originalResult.script,edited)
assert(!lastPrompt.includes(edited),'original-only model prompt must omit edited script')
assert.equal(modelCalls,beforeOriginal+1)
const beforeEmpty=modelCalls
const emptyBody={...body,creativeId:'',originalOnly:true,script:edited,requestKey:'empty-original-test-123'}
const emptyResult=await preparation.prepareVideoScript('u','b',emptyBody)
assert.equal(emptyResult.script,edited);assert.equal(emptyResult.originalScript,'');assert.equal(modelCalls,beforeEmpty)
assert.deepEqual(await preparation.prepareVideoScript('u','b',emptyBody),emptyResult)
const rewriteBody={...body,action:'rewrite',requestKey:'rewrite-facts-test-123'}
await preparation.prepareVideoScript('u','b',rewriteBody);assert.equal(factsReads,1)
const loadedSkill=await readVideoRewriteSkill()
assert(lastPrompt.startsWith(loadedSkill.text),'runtime must use actual packaged workflow')
const rewritePayload=JSON.parse(lastPrompt.split('\n').at(-1)!)
assert.equal(rewritePayload.script,rewriteBody.script)
assert.equal(rewritePayload.originalScript,undefined,'original script is never sent to rewrite model')
assert(!lastPrompt.includes('鱼的特写'),'source-only words must not reach rewrite prompt')
const rewriteReceipt=await preparation.prepareVideoScript('u','b',rewriteBody)
assert.equal(rewriteReceipt.originalScript,undefined,'rewrite model cannot overwrite restore source')
assert.equal(rewriteReceipt.originalScriptUnchanged,true)
assert.equal(rewriteReceipt.rewriteSkill.version,loadedSkill.version)
assert.equal(loadedSkill.modules.length,4)
assert.deepEqual(rewriteReceipt.rewriteSkill.modules,loadedSkill.modules)
for(const module of loadedSkill.modules){assert.match(module.version,/^sha256:[a-f0-9]{64}$/);assert(lastPrompt.includes(readFileSync('skills/amc-creative/'+module.resource,'utf8')))}
assert(!lastPrompt.includes('Preserve shot order, timing, visual subjects, facts, names and prices'))
await preparation.prepareVideoScript('u','b',rewriteBody);assert.equal(factsReads,1,'completed rewrite must not reload facts')
assert.equal(modelCalls,beforeEmpty+1)
console.log('PASS backend efficiency: no full facts for context/translation, no model for empty original, exact edited text preservation, minimal original-only prompt, rewrite receipt reuses facts/result')
const failed=records.get('video_script_'+creativeDigest(['u','b',rewriteBody.requestKey]))
failed.status='FAILED'
const callsBeforeFailureRead=modelCalls
for(let i=0;i<2;i++)await assert.rejects(preparation.prepareVideoScript('u','b',rewriteBody),/video_script_failed/)
assert.equal(modelCalls,callsBeforeFailureRead,'checking a failed receipt must not retry a paid model call')
assert.equal(factsReads,1)
await preparation.prepareVideoScript('u','b',{...rewriteBody,requestKey:'explicit-new-rewrite-123'})
assert.equal(modelCalls,callsBeforeFailureRead+1,'an explicit new rewrite can try again')
console.log('PASS failed receipt is terminal; only a new request invokes the model again')

let factsQuery:any
const factsService=load('src/lib/ai-native/facts.ts',{'../brand-plan/creativeVisibility':{},'../sku-library/service.ts':{skuIsNew:()=>false}})
const narrowFacts=await factsService.readVideoRewriteFacts({brand:{findUnique:async(query:any)=>{factsQuery=query;return {name:'Merchant',description:'Small storefront',knowledge:{promotionFocus:'Member offer valid through 2030',brandImage:'Open kitchen',menuItems:[{id:'dish',name:'Signature dish'}]}}}}},'b')
assert.equal(factsQuery.where.id,'b')
assert.equal(factsQuery.select.knowledge.select.marketingSolution,undefined)
assert.equal(factsQuery.select.knowledge.select.researchReport,undefined)
assert.equal(narrowFacts.productCatalog[0].name,'Signature dish')
assert.equal(narrowFacts.knowledge.brandImage,'Open kitchen')
assert.equal(narrowFacts.knowledge.menuItems,undefined,'do not duplicate raw catalog in model input')
assert.equal(narrowFacts.knowledge.promotionFocus,'Member offer valid through 2030')
console.log('PASS rewrite facts: actual products, activity and environment; no portfolio/research query or duplicated catalog')

const localized={...rewriteBody,requestKey:"merchant-dialog-123",instructions:"Our store has an open kitchen; use the two-person package",targetDurationSec:20}
await preparation.prepareVideoScript("u","b",localized)
assert(lastPrompt.includes(localized.instructions));assert(lastPrompt.includes("targetDurationSec"));assert(lastPrompt.includes("current editor value"))
await assert.rejects(preparation.prepareVideoScript("u","b",{...localized,instructions:"changed"}),/request_conflict/)
await assert.rejects(preparation.prepareVideoScript("u","b",{...localized,requestKey:"too-long-message-123",instructions:"x".repeat(6001)}),/invalid_video_preparation/)
console.log("PASS merchant instructions are bounded, supplied to model, and part of idempotent request identity")

modelOverride={script:"Scene 1 · 0–20s\nVisual: Our store",originalScript:"Original scene",language:"en",durationSec:20}
const localizedResult=await preparation.prepareVideoScript("u","b",{...localized,requestKey:"dialog-language-duration-123",instructions:"English narration, 20 seconds"})
assert.equal(localizedResult.language,"en");assert.equal(localizedResult.durationSec,20)
modelOverride={...modelOverride,language:"unsupported"}
await assert.rejects(preparation.prepareVideoScript("u","b",{...localized,requestKey:"dialog-invalid-output-123"}),/video_script_failed/)
console.log("PASS rewrite language and duration metadata; unsupported language output rejected")

modelOverride={originalScript:'Naskah asli yang diterjemahkan'}
const originalAcrossLanguages=await preparation.prepareVideoScript('u','b',{...body,originalOnly:true,script:'当前中文编辑内容应保持原样',requestKey:'restore-cross-language-123'})
assert.equal(originalAcrossLanguages.script,'当前中文编辑内容应保持原样')
assert.equal(originalAcrossLanguages.originalScript,modelOverride.originalScript)
modelOverride={originalScript:'原文并没有翻译成目标语言'}
await assert.rejects(preparation.prepareVideoScript('u','b',{...body,originalOnly:true,script:'Current edited script',requestKey:'restore-wrong-language-123'}),/video_script_failed/)
for(const language of ['constructor','toString','__proto__']){
 await assert.rejects(preparation.prepareVideoScript('u','b',{...body,language,requestKey:'invalid-language-key-123'}),/invalid_video_preparation/)
 modelOverride={script:'Scene 1: product',language,durationSec:8}
 await assert.rejects(preparation.prepareVideoScript('u','b',{...localized,requestKey:'invalid-model-'+language+'-123'}),/video_script_failed/)
}
console.log('PASS original-only validates translated original, preserves different-language editor text, and rejects inherited language keys')
