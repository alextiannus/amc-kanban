import assert from 'node:assert/strict'
import {duplicateCreative} from '../src/lib/ai-native/creative-diversity.ts'
const candidate=(id:string,title:string)=>({adaptationStatus:'awaiting_sku',inspirationCreativeId:id,title,product:'品牌内容',planning:'来源候选：请先确认 SKU，再生成品牌脚本。',nativeSourceSnapshot:{source:{inspirationCreativeId:id,sourcePost:{title,sourceUrl:`https://example.invalid/${id}`}}},nativeCandidate:{candidate:{sourceCreativeId:id,title,rationale:'Planning fit',planning:'来源候选：请先确认 SKU，再生成品牌脚本。',aiCaption:'',materialRequirements:[],skuIds:[]}}})
const first=candidate('one','A'),second=candidate('two','B')
assert.equal(duplicateCreative(candidate('source-1','A'),candidate('source-2','B')),false,'same-format source IDs and pending placeholder are not source identity')
assert.equal(duplicateCreative(first,second),false,'generic pending text cannot collapse distinct original sources')
assert.equal(duplicateCreative({...first,adaptationStatus:'sku_confirmed'},{...second,adaptationStatus:'sku_confirmed'}),false,'SKU confirmation is not an adapted script')
assert.equal(duplicateCreative(first,{...second,inspirationCreativeId:'one'}),true,'source identity still deduplicates')
assert.equal(duplicateCreative(first,{...second,nativeSourceSnapshot:first.nativeSourceSnapshot}),true,'same source URL remains duplicate')
const adapted={...first,adaptationStatus:'adapted',title:'Our confirmed script',planning:'A complete shared script, sufficiently long for duplicate comparison',nativeCandidate:null}
assert.equal(duplicateCreative(adapted,{...adapted,inspirationCreativeId:'other',nativeSourceSnapshot:second.nativeSourceSnapshot}),true,'real adapted scripts still deduplicate')
console.log('PASS source candidates deduplicate by actual evidence, adapted scripts retain semantic deduplication')
