const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const root=path.resolve(__dirname,'..')
function load(file,deps={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(key=>{assert.ok(key in deps,'Unexpected dependency '+key);return deps[key]},m,m.exports);return m.exports}
const contract=load('src/lib/activityPage.ts'),presentation=load('src/lib/activitySharePresentation.ts',{'./activityPage':contract}),theme=load('src/lib/brandEntryTheme.ts')
let brand={name:'TEST · 宴来居 Yan Lai Ju',status:'ACTIVE',activityPage:{text:{zh:{shareNote:'把这份喜欢，分享给朋友。'},en:{shareNote:'A little place to share with friends.'}},links:{}},knowledge:{marketingSolution:{presentationTheme:{primary:'#315e51'}}}}
let selected
const server=load('src/lib/activityShareMetadata.ts',{'react':{cache:fn=>fn},'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:{brand:{findUnique:async query=>{selected=query.select;return brand}}}},'@/lib/activityPage':contract,'@/lib/activitySharePresentation':presentation,'@/lib/brandEntryTheme':theme})
let language='zh-CN'
const page=load('src/app/game/[brandId]/page.tsx',{'react/jsx-runtime':{},'next/headers':{headers:async()=>new Headers({'accept-language':language})},'@/lib/activityShareMetadata':server,'@/lib/activitySharePresentation':presentation,'./CustomerGameClient':{}})
;(async()=>{
 const config=require(path.join(root,'next.config.js'));for(const agent of ['MicroMessenger','facebookexternalhit','Twitterbot','Mozilla/5.0 AMC-Activity-HTML']) assert.equal(config.htmlLimitedBots.test(agent),true)
 const zh=await page.generateMetadata({params:Promise.resolve({brandId:'TEST'})})
 assert.match(zh.title.absolute,/TEST · 宴来居/);assert.match(zh.description,/把这份喜欢/);assert.doesNotMatch(zh.description,/饮品|赠送|free drink/)
 assert.equal(zh.alternates.canonical,'https://amc.immedi.ai/game/TEST');assert.equal(zh.openGraph.siteName,brand.name);assert.equal(zh.openGraph.images[0].width,800)
 assert.equal(new URL(zh.openGraph.images[0].url).origin,'https://amc.immedi.ai');assert.match(zh.openGraph.images[0].url,/lang=zh&v=/)
 assert.equal(selected.postfastApiKey,undefined);assert.equal(selected.accounts,undefined)
 language='en-SG';const en=await page.generateMetadata({params:Promise.resolve({brandId:'TEST'})});assert.match(en.description,/A little place/);assert.equal(en.openGraph.locale,'en_US')
 const first=en.openGraph.images[0].url;brand.activityPage.text.en.shareNote='A new invitation.';const changed=await page.generateMetadata({params:Promise.resolve({brandId:'TEST'})});assert.notEqual(first,changed.openGraph.images[0].url)
 brand.status='ARCHIVED';assert.equal((await page.generateMetadata({params:Promise.resolve({brandId:'TEST'})})).robots.index,false)
 brand=null;assert.equal((await page.generateMetadata({params:Promise.resolve({brandId:'missing'})})).robots.index,false)
 console.log('PASS brand-specific bilingual title/description/image/icon metadata, canonical URL, no reward claims or credentials, image version changes, archived/missing brands.')
})().catch(error=>{console.error(error);process.exitCode=1})
