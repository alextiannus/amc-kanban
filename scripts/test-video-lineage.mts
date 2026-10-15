import assert from 'node:assert/strict'
import { pinVideoEditor, editorForLibrary,videoDraftForLibrary } from '../src/lib/videoLineage.ts'
const source={sourceRevision:'source-v1',libraryDigest:'digest-v1',evidenceStatus:'full_source',timeline:[{shotId:'original-1',narrativePurpose:'reveal'}]}
const row:any={id:'revision-1',brandId:'brand',kind:'CREATIVE_ITEM',input:{creativeId:'creative'},output:{id:'creative',planning:'saved script',source,skuDecision:{selectedSkuIds:['sku-1'],recommendations:[{skuId:'sku-1',sourceShotIds:['original-1'],roles:['hero']}]}}}
const db:any={brandMarketingSolution:{findFirst:async({where}:any)=>where.id===row.id&&where.brandId===row.brandId?row:null}}
const input={brandId:'brand',creativeId:'creative',creativeRevisionId:'revision-1',sourceReference:{libraryDigest:'forged'},script:'actual edited script',assets:[{id:'asset',url:'https://example.invalid/a.jpg',mimeType:'image/jpeg'}]}
const pinned=await pinVideoEditor(db,'brand',input)
assert.equal(pinned.sourceReference.libraryDigest,'digest-v1')
assert.equal(pinned.creativeRevisionId,'revision-1')
assert.deepEqual(pinned.skuDecision.selectedSkuIds,['sku-1'])
assert.equal(pinned.script,'actual edited script')
assert.equal(pinned.shotMappings[0].sourceShotId,'original-1')
row.output.source.rawAnalysis={secret:'must-not-leak'};row.output.source.libraryDetailPath='/admin/private'
const projected=await pinVideoEditor(db,'brand',input);assert.equal(projected.sourceReference.rawAnalysis,undefined);assert.equal(projected.sourceReference.libraryDetailPath,undefined)
const reopened=editorForLibrary({brandId:'brand',creativeId:'creative',idea:'fallback',assetIds:['asset'],plan:{_mmVideoJob:{editor:pinned}}},[])
assert.equal(reopened.sourceReference.libraryDigest,'digest-v1')
assert.deepEqual(reopened.assets,pinned.assets,'retain selected snapshot even after asset deletion')
assert.deepEqual(reopened.missingAssetIds,['asset'])
const assetDraft=videoDraftForLibrary({id:'video',assetIds:['asset'],plan:{_mmVideoJob:{editor:pinned,revisions:[{id:'revision-edit',method:'video_scene_edit'}]}}},[])
assert.equal(assetDraft.revisions[0].method,'video_scene_edit');assert.deepEqual(assetDraft.editor,reopened)
row.output.source.libraryDigest='latest'
assert.equal(pinned.sourceReference.libraryDigest,'digest-v1','deep snapshot')
assert.deepEqual(await pinVideoEditor(db,'brand',{...input,sourceReference:{libraryDigest:'forged'}},pinned),pinned,'existing pin never refreshed')
await assert.rejects(()=>pinVideoEditor(db,'other',input),/video_lineage_not_found/)
await assert.rejects(()=>pinVideoEditor(db,'brand',{...input,creativeId:'wrong'}),/video_lineage_not_found/)
await assert.rejects(()=>pinVideoEditor(db,'brand',{...input,creativeRevisionId:'other'},pinned),/video_lineage_immutable/)
await assert.rejects(()=>pinVideoEditor(db,'brand',{...input,script:'x'.repeat(20001)}),/video_editor_too_large/)
assert.equal((await pinVideoEditor(db,'brand',{brandId:'brand',script:'legacy',assets:[]})).lineageWarning,'legacy_evidence_unavailable')
console.log('PASS video authoritative pins, immutable reopen, forgery, scope, size and legacy')
