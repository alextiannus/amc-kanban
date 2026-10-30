const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const root=path.resolve(__dirname,'..')
function compile(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{assert.ok(n in deps,n);return deps[n]},m,m.exports);return m.exports}
const contract=compile('src/lib/activityPage.ts');let calls=0,fail=false
const translator=compile('src/lib/activityPageTranslation.ts',{'./activityPage':contract,'@/lib/llmRouter':{callLLM:async(_tag,prompt,_tokens,options)=>{
 calls++;assert.equal(options.allowAnyFallback,false);assert.equal(options.maxAttempts,1)
 if(fail)return{text:null}
 const tasks=JSON.parse(prompt.split('Fields: ')[1])
 return{text:JSON.stringify({translations:tasks.map(x=>({key:x.key,locale:x.locale,text:x.key==='reward'?'Follow us for a complimentary drink. Thank you for your support.':`Translation: ${x.source}`}))})}
}}})
;(async()=>{
 const reward='关注账号，可获赠饮品一份。感谢您对我们的支持'
 const source={text:{zh:{greeting:'欢迎来做客'}},links:{'instagram:test':'https://example.test/'}}
 const [page,concurrent]=await Promise.all([translator.translateActivityPage(source,reward),translator.translateActivityPage(source,reward)])
 assert.equal(calls,1,'Concurrent identical requests share a single model call')
 assert.equal(contract.activityText(page,'reward','en',reward),'Follow us for a complimentary drink. Thank you for your support.')
 assert.equal(contract.activityText(page,'reward','zh',reward),reward)
 assert.deepEqual(source,{text:{zh:{greeting:'欢迎来做客'}},links:{'instagram:test':'https://example.test/'}})
 assert.deepEqual(page.links,source.links);assert.deepEqual(page,concurrent)
 assert.equal(contract.activityPageDraftSnapshot(source,reward),contract.activityPageDraftSnapshot(page,reward),'Generated translations alone are not merchant edits')
 const changed={...page,text:{zh:{greeting:'新的活动内容'}}}
 assert.equal(contract.activityText(changed,'greeting','en'),'新的活动内容','Never display a translation for old source text')
 const manual={...page,text:{...page.text,en:{greeting:'My own welcome',reward:'My own gift'}}}
 const result=await translator.translateActivityPage(manual,reward)
 assert.equal(contract.activityText(result,'greeting','en'),'My own welcome');assert.equal(contract.activityText(result,'reward','en',reward),'My own gift');assert.equal(calls,1)
 await translator.translateActivityPage(null,contract.activityTextDefaults.reward.zh);assert.equal(calls,1,'Built-in bilingual offer needs no model')
 fail=true
 const failed=await translator.translateActivityPage({text:{zh:{greeting:'失败测试'}},links:{}},'')
 assert.equal(contract.activityText(failed,'greeting','en'),'失败测试')
 await translator.translateActivityPage({text:{zh:{greeting:'失败测试'}},links:{}},'');assert.equal(calls,2,'Failures have a retry cooldown')
 const share=compile('src/lib/activityShare.ts',{'./gameQr':compile('src/lib/gameQr.ts')});let opened=[],copied=[]
 assert.equal(await share.shareActivityPage('brand','Brand','Share this place',{share:async data=>opened.push(data),clipboard:{writeText:async v=>copied.push(v)}}),'shared')
 assert.equal(opened[0].url,'https://amc.immedi.ai/game/brand');assert.equal(copied.length,0)
 assert.equal(await share.shareActivityPage('brand','Brand','Share',{clipboard:{writeText:async v=>copied.push(v)}}),'copied');assert.equal(copied.pop(),'https://amc.immedi.ai/game/brand')
 assert.equal(await share.shareActivityPage('brand','Brand','Share',{share:async()=>{throw {name:'AbortError'}},clipboard:{writeText:async v=>copied.push(v)}}),'cancelled');assert.equal(copied.length,0)
 assert.equal(await share.shareActivityPage('brand','Brand','Share',{}),'failed')
 console.log('PASS custom reward/copy translation: source invalidation, manual overrides, singleflight cache, no input mutation, no guessed fallback, failure cooldown; store sharing: permanent URL, native share, clipboard fallback and cancellation.')
})().catch(e=>{console.error(e);process.exit(1)})
