import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {revisionReasons,scriptForSourceShot} from '../src/lib/creativeReviewContract.ts'
import {REVISION_REASONS} from '../src/lib/brand-plan/revisionFeedback.ts'
assert.deepEqual(REVISION_REASONS,['sku_mismatch','selling_point','transitions','visual_description','voiceover','subtitle','platform_style','material_feasibility','brand_facts','other'])
assert.equal(revisionReasons.length,10)
assert.equal(scriptForSourceShot('Human prose mentions shot-1','shot-1',['shot-1']),null)
assert.equal(scriptForSourceShot('1. shot-1 Hook\nServe\n2. shot-2 Close','shot-1',['shot-1','shot-2']),'1. shot-1 Hook\nServe')
if(process.env.AMC_MM_REPO){
 const mm=await readFile(process.env.AMC_MM_REPO+'/src/lib/creativeRevisions.ts','utf8')
 const local=await readFile(new URL('../src/lib/creativeReviewContract.ts',import.meta.url),'utf8')
 assert.equal(local.slice(local.indexOf('export const revisionReasons')),mm.slice(0,mm.indexOf('export const editableCreativeFields')))
 const mmSource=await readFile(process.env.AMC_MM_REPO+'/src/components/creatives/CreativeSourceComparison.tsx','utf8')
 const source=await readFile(new URL('../src/components/creatives/CreativeSourceComparison.tsx',import.meta.url),'utf8')
 for(const key of ['export type SourceShot=','export type CreativeSource='])assert.equal(source.split('\n').find(l=>l.startsWith(key)),mmSource.split('\n').find(l=>l.startsWith(key)))
 const mmSku=await readFile(process.env.AMC_MM_REPO+'/src/components/creatives/CreativeSkuDecision.tsx','utf8')
 const sku=await readFile(new URL('../src/components/creatives/CreativeSkuDecision.tsx',import.meta.url),'utf8')
 assert.equal(sku.split('\n').find(l=>l.startsWith('export type SkuRecommendation=')),mmSku.split('\n').find(l=>l.startsWith('export type SkuRecommendation=')))
}
console.log('PASS: ten canonical reason keys, stable shot mapping, and MM source/SKU/label contract parity')
