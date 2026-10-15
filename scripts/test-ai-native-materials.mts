import assert from 'node:assert/strict'
import {candidateFrom,digest,type CreativeIntent} from '../src/lib/ai-native/contract.ts'
const intent:CreativeIntent={kind:'creative',brandId:'b',userId:'u',creativeId:'c',month:'2026-11',expectedRevision:'v',artifactPath:'work/x.json',requestKey:'materials-test',goal:'Rewrite'}
const raw={kind:'creative_candidate',brandId:'b',creativeId:'c',month:'2026-11',expectedRevision:'v',contextDigest:digest({}),rationale:'Improve filming',factsUsed:[],sourceCreativeId:null,patch:{planning:'Opening and CTA'},materialRequirements:['Film product close-up']}
const original=JSON.stringify(raw)
assert.deepEqual(candidateFrom(original,intent).patch.materialRequirements,raw.materialRequirements)
assert.equal(JSON.stringify(raw),original,'Raw evidence remains unchanged')
assert.deepEqual(candidateFrom(JSON.stringify({...raw,patch:{...raw.patch,materialRequirements:['Nested requirement']}}),intent).patch.materialRequirements,['Nested requirement'])
assert.throws(()=>candidateFrom(JSON.stringify({...raw,materialRequirements:'not an array'}),intent))
assert.deepEqual(candidateFrom(JSON.stringify({...raw,materialRequirements:undefined}),intent).patch,raw.patch,'Historical candidate without materials remains readable')
console.log('PASS: material requirements canonical projection, precedence, validation and immutable evidence')
const materialsIntent:CreativeIntent={...intent,editMode:'materials',draftScript:'镜头 1：真人吃面。\n镜头 2：大面条出锅。',requireMaterials:true}
const materialsCandidate={...raw,materialRequirements:undefined,patch:{materialRequirements:['真人吃面的近景，竖屏 3 秒','大面条出锅特写，竖屏 4 秒']}}
assert.equal(candidateFrom(JSON.stringify(materialsCandidate),materialsIntent).patch.planning,materialsIntent.draftScript,'server binds the exact human script without asking the model to reproduce it')
assert.throws(()=>candidateFrom(JSON.stringify({...materialsCandidate,patch:{...materialsCandidate.patch,planning:'Rewritten story'}}),materialsIntent),/materials_only_patch_required/)
assert.throws(()=>candidateFrom(JSON.stringify({...materialsCandidate,patch:{...materialsCandidate.patch,title:'New title'}}),materialsIntent),/materials_only_patch_required/)
assert.throws(()=>candidateFrom(JSON.stringify({...materialsCandidate,patch:{planning:materialsIntent.draftScript}}),materialsIntent),/materials_only_patch_required/)
assert.equal(candidateFrom(JSON.stringify({...materialsCandidate,patch:{...materialsCandidate.patch,planning:materialsIntent.draftScript}}),materialsIntent).patch.planning,materialsIntent.draftScript)
console.log('PASS: materials-only updates preserve human script and reject unrelated mutations')

assert.equal(candidateFrom(JSON.stringify(materialsCandidate),{...materialsIntent,draftScript:'  真人吃面。\n'}).patch.planning,'  真人吃面。\n','preserve whitespace in the human draft too')
