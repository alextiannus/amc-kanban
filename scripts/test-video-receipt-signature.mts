import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {verifyVideoReceipt,videoReceiptDigest,videoEditorPins} from '../src/lib/videoReceipt.ts'
const token='test-only-first-key',now=Date.now(),editor={creativeId:'creative',creativeRevisionId:'revision',sourceReference:{libraryDigest:'digest'},skuDecision:{selectedSkuIds:['sku']},shotMappings:[{sourceShotId:'original'}],submittedScript:'actual',assets:[]}
const input={projectId:'project',brandId:'brand',ownerId:'owner',editor,revisions:[{id:'revision-edit',actorId:'owner',method:'video_scene_edit'}],revisionsHasMore:false}
const payload={schemaVersion:'amc-video-lineage@1',projectId:input.projectId,brandId:input.brandId,ownerId:input.ownerId,editorActorId:'owner',editorDigest:videoReceiptDigest(videoEditorPins(editor)),historyDigest:videoReceiptDigest({revisions:input.revisions,hasMore:false}),issuedAt:new Date(now).toISOString()}
const receipt={...payload,signature:createHmac('sha256',token).update(JSON.stringify(payload)).digest('hex')}
assert.equal(videoReceiptDigest({createdAt:new Date(payload.issuedAt)}),videoReceiptDigest({createdAt:payload.issuedAt}))
assert.equal(verifyVideoReceipt({...input,receipt},token,now),receipt)
for(const changed of [{brandId:'other'},{projectId:'other'},{ownerId:'other'},{editor:{...editor,sourceReference:{libraryDigest:'forged'}}},{revisions:[{id:'forged',actorId:'admin'}]}])assert.throws(()=>verifyVideoReceipt({...input,...changed,receipt},token,now),/video_receipt_invalid/)
assert.throws(()=>verifyVideoReceipt({...input,receipt:{...receipt,issuedAt:new Date(now+120000).toISOString()}},token,now),/video_receipt_invalid/)
assert.throws(()=>verifyVideoReceipt({...input,receipt},token,now+16*60*1000),/video_receipt_invalid/)
assert.throws(()=>verifyVideoReceipt({...input,receipt},'rotated-key',now),/video_receipt_invalid/)
assert.equal(verifyVideoReceipt({...input,receipt,existing:structuredClone(receipt)},'rotated-key',now),receipt,'persisted original is retryable during its original TTL after key rotation')
assert.throws(()=>verifyVideoReceipt({...input,receipt,existing:{...receipt,issuedAt:new Date(now+1).toISOString()}},token,now),/video_receipt_invalid/)
assert.throws(()=>verifyVideoReceipt({...input,receipt,revisions:Array(101).fill({})},token,now),/video_receipt_invalid/)
console.log('PASS signed video receipt: identity/pins/history binding, expiry, tampering, replay downgrade, size and safe token rotation')
