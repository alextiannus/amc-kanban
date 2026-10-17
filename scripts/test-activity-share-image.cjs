const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const root=path.resolve(__dirname,'..');process.chdir(root)
function load(file,deps={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(key=>{assert.ok(key in deps,'Unexpected dependency '+key);return deps[key]},m,m.exports);return m.exports}
const jsx=require('react/jsx-runtime'),theme=load('src/lib/brandEntryTheme.ts')
const card=load('src/components/ActivityShareCard.tsx',{'react/jsx-runtime':jsx,'@/lib/brandEntryTheme':theme})
let brand={name:'TEST · 宴来居 Yan Lai Ju',color:'#315e51'}
const route=load('src/app/game/[brandId]/share-image/route.tsx',{'react/jsx-runtime':jsx,'next/og':require('next/og'),'node:fs/promises':require('node:fs/promises'),'node:path':require('node:path'),'@/lib/activityShareMetadata':{getActivityShareBrand:async()=>brand},'@/components/ActivityShareCard':card})
;(async()=>{
 for (const lang of ['zh','en']) {
  const response=await route.GET(new Request('https://amc.immedi.ai/game/TEST/share-image?lang='+lang),{params:Promise.resolve({brandId:'TEST'})})
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/)
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.readUInt32BE(16),800);assert.equal(bytes.readUInt32BE(20),800);assert.ok(bytes.length>10000&&bytes.length<200000)
 }
 brand=null;assert.equal((await route.GET(new Request('https://amc.immedi.ai/game/missing/share-image'),{params:Promise.resolve({brandId:'missing'})})).status,404)
 console.log('PASS actual bilingual PNG image rendering with local CJK font, square thumbnail dimensions, compact image size and missing-brand response.')
})().catch(error=>{console.error(error);process.exitCode=1})
