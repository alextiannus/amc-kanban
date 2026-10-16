import assert from 'node:assert/strict'
import {reviewCreativeFidelity,nextRepairAction,parseFidelityClassification,beginFidelityAttempt,completeFidelityAttempt,FIDELITY_DIMENSIONS} from '../src/lib/brand-plan/creativeFidelity.ts'

const source:any={inspirationCreativeId:'cre_source',sourceRevision:'r1',sourceDigest:'a'.repeat(64),evidenceStatus:'full_source',timeline:[
  {id:'s1',narrativePurpose:'hook',subjectAction:'Open the box',continuityRequirements:['same box']},
  {id:'s2',narrativePurpose:'selling point',subjectAction:'Show the detail',continuityRequirements:['same box']},
  {id:'s3',narrativePurpose:'cta',subjectAction:'Point to the link',continuityRequirements:['same box']},
]}
const shot=(s:any)=>({contractVersion:2,sourceShotId:s.id,skuIds:['sku'],visualDescription:'Alpha box on a table',subjectAction:s.subjectAction,spokenText:'Alpha',captionMode:'mirror_spoken',overlayText:'',soundDesign:'Music',transition:'Match cut',narrativePurpose:s.narrativePurpose,continuityRequirements:['same box'],sourcePreservation:{hookRole:s.id==='s1'?'preserved':'not_applicable',narrativeRole:'preserved',pacingRole:'preserved',changeReasons:[]}})
const adapted={shots:source.timeline.map(shot)}
assert.deepEqual(reviewCreativeFidelity(source,adapted).dimensions.map(x=>x.key),['hook','narrative_order','selling_point_position','continuity','cta','diversity'])
assert.equal(nextRepairAction({status:'failed',repairCount:0}),'repair_once')
assert.equal(nextRepairAction({status:'failed',repairCount:1}),'needs_revision')
const classifications=(failed=false)=>FIDELITY_DIMENSIONS.map(key=>({key,status:failed&&key==='hook'?'failed':'passed',issues:failed&&key==='hook'?['Hook loses the original contrast']:[]}))
const model={candidateDigest:'b'.repeat(64),dimensions:classifications()}
assert.equal(parseFidelityClassification(model,model.candidateDigest).dimensions.length,6)
for(const bad of [{...model,sourceCreativeId:'forged'},{...model,candidateDigest:'wrong'},{...model,dimensions:model.dimensions.slice(1)},{...model,dimensions:[model.dimensions[0],...model.dimensions.slice(0,5)]},{...model,dimensions:model.dimensions.map(x=>({...x,key:'unknown'}))},{...model,dimensions:model.dimensions.map(x=>({...x,status:'passed',issues:['contradiction']}))}])assert.throws(()=>parseFidelityClassification(bad,model.candidateDigest),/fidelity/)
const unreviewed=reviewCreativeFidelity(source,adapted)
assert.equal(unreviewed.status,'failed','deterministic checks alone cannot claim semantic model approval')
assert.equal(reviewCreativeFidelity(source,adapted,model).status,'passed')
assert.equal(reviewCreativeFidelity(source,adapted,{...model,dimensions:model.dimensions.map(d=>({...d,status:'not_applicable'}))} as any).status,'failed','not_applicable cannot skip dimensions supported by source or multiple shots')
const reordered={shots:[adapted.shots[1],adapted.shots[0],adapted.shots[2]]}
assert.equal(reviewCreativeFidelity(source,reordered,model).dimensions.find(x=>x.key==='narrative_order')?.status,'failed','model approval cannot override deterministic failures')
assert.equal(reviewCreativeFidelity(source,{shots:[...adapted.shots.slice(0,2),{...adapted.shots[2],narrativePurpose:''}]},model).dimensions.find(x=>x.key==='cta')?.status,'failed')
const artifact={path:'work/candidate.json',revision:1,digest:model.candidateDigest}
let state=beginFidelityAttempt(null,source,adapted,artifact)
assert.equal(state.status,'awaiting_review')
assert.deepEqual(beginFidelityAttempt(state,source,adapted,artifact),state,'verifier replay does not append an attempt')
state=completeFidelityAttempt(state,{...model,dimensions:classifications(true)})
assert.equal(state.status,'repair_required');assert.equal(state.repairCount,0)
const identicalRepair=beginFidelityAttempt(state,source,adapted,{...artifact,revision:2})
assert.equal(identicalRepair.repairCount,1,'a new workspace revision consumes the repair even if its bytes are unchanged')
assert.equal(completeFidelityAttempt(identicalRepair,{...model,dimensions:classifications(true)}).status,'needs_revision')
assert.deepEqual(completeFidelityAttempt(state,{...model,dimensions:classifications(true)}),state,'classification retry is idempotent')
assert.throws(()=>completeFidelityAttempt(state,model),/fidelity_review_changed/)
assert.throws(()=>beginFidelityAttempt(state,{...source,sourceRevision:'forged'},adapted,{...artifact,revision:2,digest:'c'.repeat(64)}),/fidelity_source_changed/)
state=beginFidelityAttempt(state,source,{shots:adapted.shots.map((s:any)=>({...s,spokenText:'Repaired Alpha'}))},{...artifact,revision:2,digest:'c'.repeat(64)})
assert.equal(state.repairCount,1)
state=completeFidelityAttempt(state,{candidateDigest:'c'.repeat(64),dimensions:classifications(true)})
assert.equal(state.status,'needs_revision');assert.equal(state.attempts.length,2)
assert.equal(state.attempts[0].adapted.shots[0].spokenText,'Alpha')
assert.equal(state.attempts[1].adapted.shots[0].spokenText,'Repaired Alpha')
assert.equal(state.attempts[0].review?.dimensions[0].status,'failed')
assert.throws(()=>beginFidelityAttempt(state,source,adapted,{...artifact,revision:3,digest:'d'.repeat(64)}),/fidelity_repair_limit/)
assert.deepEqual(beginFidelityAttempt(state,source,state.attempts[1].adapted,{...artifact,revision:2,digest:'c'.repeat(64)}),state)
console.log('PASS fixed fidelity rubric, fail-closed classifications, deterministic veto, durable replay and one-repair boundary')
