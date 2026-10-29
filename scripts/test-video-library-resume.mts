import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let allowed=true,permitted=true,owned=false
const draft={jobId:'other-job',editor:{brandId:'b',script:'Saved script',assets:[{id:'ok',url:'stale'},{id:'cross-brand',url:'bad'}],originVideoJobId:'private',productionPlan:{private:true},sourceReference:{private:true},creativeId:'private-creative',targetDurationSec:20}}
const db={mediaAsset:{findFirst:async({where}:any)=>where.brandId==='b'&&where.id==='asset'?{technicalMetadata:{videoDraft:draft}}:null,findMany:async({where}:any)=>{assert.equal(where.brandId,'b');return [{id:'ok',url:'trusted',mimeType:'image/jpeg'}]}},videoProductionJob:{findFirst:async({where}:any)=>{assert.deepEqual(where,{id:'other-job',brandId:'b',createdBy:'u'});return owned?{id:'other-job'}:null}}}
const deps:any={'@prisma/client':{},'node:crypto':await import('node:crypto'),'./prisma':{prisma:db},'./user-management/brandAccess':{canUserAccessBrand:async()=>allowed},'./role-permissions/delegation':{requireActorPermission:async()=>{if(!permitted)throw Error('denied')}},'./videoLineage':{videoDraftForLibrary:()=>{throw Error('must not read private job')}}}
const m={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/videoLibrary.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((k:string)=>deps[k],m,m.exports)
const resume=m.exports.resumeLibraryVideo
const copy=await resume('u','b',{assetId:'asset'})
assert.equal(copy.mode,'copy');assert.equal(copy.editor.script,'Saved script');assert.equal(copy.editor.assets[0].url,'trusted');assert.deepEqual(copy.editor.missingAssetIds,['cross-brand']);assert.equal(copy.editor.originVideoJobId,undefined);assert.equal(copy.editor.productionPlan,undefined);assert.equal(copy.editor.sourceReference,undefined);assert.equal(copy.editor.creativeId,null)
owned=true;assert.deepEqual(await resume('u','b',{assetId:'asset'}),{mode:'owned',jobId:'other-job'})
await assert.rejects(resume('u','other',{assetId:'asset'}));allowed=false;await assert.rejects(resume('u','b',{assetId:'asset'}));allowed=true;permitted=false;await assert.rejects(resume('u','b',{assetId:'asset'}))
console.log('PASS shared-library copy uses authorized snapshot/current brand assets, strips private lineage, preserves owner-only jobs and denies revoked access')
