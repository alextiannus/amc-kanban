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
