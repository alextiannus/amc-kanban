import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as sku from '../src/lib/brand-plan/creativeSkuContract.ts'
import {digest} from '../src/lib/ai-native/contract.ts'

const catalog=sku.skuCatalog({knowledge:{menuItems:[{id:'a',name:'招牌饭'},{id:'b',name:'蔬菜汤'},{id:'c',name:'未选甜品'}]}})
const source:any={inspirationCreativeId:'source',sourceRevision:'r1',sourceDigest:'f'.repeat(64),evidenceStatus:'full_source',timeline:[
  {id:'s1',order:1,startSec:0,endSec:3,shotScale:'近景',cameraMovement:'推进',visualDescription:'米饭端到桌上',subjectAction:'端盘',voiceover:'招牌饭快速上桌',onScreenText:'招牌菜快速上桌',sound:'碗盘轻碰',transition:'动作匹配切镜',narrativePurpose:'开场上桌钩子',continuityRequirements:['同一张木桌']},
  {id:'s2',order:2,startSec:3,endSec:6,shotScale:'特写',cameraMovement:'平移',visualDescription:'汤碗细节',subjectAction:'放下汤碗',voiceover:'搭配一碗蔬菜汤',onScreenText:'一饭一汤',sound:'延续碗盘声',transition:'淡出',narrativePurpose:'组合搭配',continuityRequirements:['保持左饭右汤']},
]}
const binding={brandId:'brand',creativeId:'idea',month:'2026-11',expectedRevision:'r',catalogDigest:sku.catalogDigest(catalog),sourceRevision:source.sourceRevision,sourceDigest:source.sourceDigest}
const decision=sku.confirmSkuDecision({...binding,selectedSkuIds:['a','b'],recommendations:catalog.slice(0,2).map((s,i)=>({skuId:s.id,skuName:s.name,roles:['hero'],rationale:'适合对应动作',sourceShotIds:[`s${i+1}`]}))},catalog,source,'human','r')
const intent={...binding,kind:'creative_adaptation',decisionDigest:decision.digest}
const output:any={...intent,contextDigest:'e'.repeat(64),mode:'source_adaptation',title:'饭汤上桌',aiCaption:'一饭一汤',materialRequirements:['准备两道已确认商品的实拍'],shots:source.timeline.map((s:any,i:number)=>({
  contractVersion:2,sourceShotId:s.id,skuIds:[catalog[i].id],visualDescription:`${catalog[i].name}上桌近景`,subjectAction:s.subjectAction,spokenText:s.voiceover,captionMode:'mirror_spoken',overlayText:s.onScreenText,soundDesign:s.sound,transition:s.transition,narrativePurpose:s.narrativePurpose,continuityRequirements:s.continuityRequirements,
  sourcePreservation:{hookRole:i===0?'preserved':'not_applicable',narrativeRole:'preserved',pacingRole:'preserved',changeReasons:[]},
}))}
const save=(value=output,boundSource=source)=>sku.adaptationFrom(JSON.stringify(value),intent,catalog,boundSource,decision)
const withShot=(patch:any,index=0)=>({...output,shots:output.shots.map((shot:any,i:number)=>i===index?{...shot,...patch}:shot)})
const preservation=(changeReasons:string[],patch:any={})=>({...output.shots[0].sourcePreservation,changeReasons,...patch})
assert.equal(save().shots[0].spokenText,'招牌饭快速上桌')
assert.equal(save().shots[0].contractVersion,2)
assert.equal(save(withShot({narrativePurpose:'用已确认菜品建立开场注意力'})).shots[0].narrativePurpose,'用已确认菜品建立开场注意力','adapted narrative is not overwritten by the source snapshot')
for(const [field,error] of [['spokenText','source_voiceover_required'],['overlayText','source_overlay_required'],['soundDesign','source_sound_required'],['transition','source_transition_required'],['narrativePurpose','source_narrative_required']] as const){
  assert.throws(()=>save(withShot({[field]:''})),new RegExp(error))
  assert.throws(()=>save(withShot({[field]:'   '})),new RegExp(error))
}
assert.throws(()=>save(withShot({continuityRequirements:[]})),/source_continuity_required/)
assert.throws(()=>save(withShot({continuityRequirements:[' ']})),/invalid/)
assert.throws(()=>save(withShot({spokenText:'',captionMode:'off',sourcePreservation:preservation(['brand_facts'])})),/source_voiceover_required/)
assert.throws(()=>save(withShot({spokenText:'',captionMode:'off',sourcePreservation:preservation(['anything'])})),/source_preservation_invalid/)
const silent=withShot({spokenText:'',captionMode:'off',sourcePreservation:preservation(['voiceover_removed_for_visual_storytelling'],{narrativeRole:'adapted'})})
assert.match(save(silent).patch.planning,/视觉叙事：明确不使用口播/)
assert.match(save(silent).patch.planning,/voiceover_removed_for_visual_storytelling/)
assert.match(save(silent).patch.planning,/narrativeRole: adapted/)
assert.throws(()=>save({...silent,shots:[{...silent.shots[0],overlayText:''},silent.shots[1]]}),/source_overlay_required/)
assert.throws(()=>save(withShot({spokenText:'',sourcePreservation:preservation(['voiceover_removed_for_visual_storytelling'])})),/silent_caption_mode_invalid/)
for(const [field,reason] of [['overlayText','overlay_removed_for_visual_storytelling'],['soundDesign','sound_removed_for_visual_storytelling'],['transition','transition_removed_for_visual_storytelling']]){
  assert.equal(save(withShot({[field]:'',sourcePreservation:preservation([reason])})).shots[0][field],'')
  assert.throws(()=>save(withShot({[field]:'',sourcePreservation:preservation(['platform_style'])})),/source_.*_required/)
}
assert.throws(()=>save(withShot({captionMode:'separate'})),/adaptation_shot_invalid/)
for(const legacy of ['voiceover','onScreenText','sound','subtitle','captionText'])assert.throws(()=>save(withShot({[legacy]:'competing text'})),/adaptation_shot_invalid/)
assert.throws(()=>save(withShot({contractVersion:1})),/adaptation_shot_invalid/)
assert.throws(()=>save(withShot({sourcePreservation:preservation([],{narrativeRole:'adapted'})})),/source_change_reason_required/)
assert.throws(()=>save(withShot({sourcePreservation:preservation([],{hookRole:'unknown'})})),/source_preservation_invalid/)
assert.throws(()=>save({...output,shots:[...output.shots].reverse()}),/shot_coverage/)
assert.throws(()=>save({...output,shots:[output.shots[0],output.shots[0]]}),/shot_coverage/)
assert.throws(()=>save(withShot({skuIds:['b']})),/sku_mapping/)
assert.throws(()=>save(withShot({visualDescription:'米饭上桌',spokenText:'快速上桌'})),/sku_name_required/)
assert.throws(()=>save(withShot({overlayText:'未选甜品'})),/unselected_sku/)
const noVoiceSource={...source,timeline:[{...source.timeline[0],voiceover:''},source.timeline[1]]}
assert.equal(save(withShot({spokenText:'',captionMode:'off'}),noVoiceSource).shots[0].spokenText,'')
for(const [alias,field,error] of [['spokenText','spokenText','source_voiceover_required'],['overlayText','overlayText','source_overlay_required'],['soundDesign','soundDesign','source_sound_required']] as const){
  const v2Source={...source,timeline:[{...source.timeline[0],voiceover:'',onScreenText:'',sound:'',[alias]:'完整来源内容'},source.timeline[1]]}
  assert.throws(()=>save(withShot({[field]:''}),v2Source),new RegExp(error))
}
assert.throws(()=>save(withShot({spokenText:''}),{...source,timeline:[{...source.timeline[0],voiceover:'长'.repeat(10001)},source.timeline[1]]}),/source_voiceover_required/)
assert.throws(()=>save({...output,shots:[...output.shots,{...output.shots[1],sourceShotId:undefined,skuIds:[]}]}),/shot_coverage/)

// Exercise the actual agent context builder: complete, ordered, selected-only examples
// must validate against the same boundary that accepts a produced artifact.
const facts={id:'brand',name:'饭汤小馆',description:'已确认品牌资料',knowledge:{menuItems:catalog}}
const mod={exports:{} as any}
const deps:any={'../brand-plan/creativeSkuDecision':{readBoundSkuContext:async()=>({binding,current:{current:{skuDecision:decision}},catalog,source,facts})},'../brand-plan/creativeSkuContract':sku,'./contract':{digest,nativeError:(code:string)=>new Error(code)}}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/sku-workflow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>deps[key],mod,mod.exports)
const context=await mod.exports.skuTaskContext({...intent,userId:'human',artifactPath:'work/adapt.json'})
assert.match(context.artifactContract.instructions,/spokenText/)
assert.match(context.artifactContract.instructions,/sole/)
assert.equal(context.artifactContract.changeReasons.voiceover_removed_for_visual_storytelling,'视觉叙事：明确不使用口播')
const example=context.artifactContract.example
assert.deepEqual(example.shots.map((s:any)=>s.sourceShotId),['s1','s2'])
assert.deepEqual(example.shots.map((s:any)=>s.skuIds),[['a'],['b']])
for(const shot of example.shots)for(const field of ['spokenText','overlayText','soundDesign','transition','narrativePurpose'])assert.ok(shot[field].trim(),`${field} example must be non-empty`)
assert.equal(save(example).shots.length,2)
console.log('PASS V2 canonical text, per-field preservation, displayed explicit silence, source order, exact SKU mapping and complete agent examples')
