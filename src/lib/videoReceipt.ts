import {createHash,createHmac,timingSafeEqual} from 'node:crypto'
const ordered=(value:any):any=>value instanceof Date?value.toISOString():Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])])):value
export const videoReceiptDigest=(value:any)=>createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
export function videoEditorPins(editor:any){return editor?Object.fromEntries(['creativeId','creativeRevisionId','sourceReference','skuDecision','shotMappings','submittedScript','assets','lineageWarning'].map(key=>[key,editor[key]??null])):null}
const fail=()=>Object.assign(new Error('video_receipt_invalid_or_expired'),{status:409})
export const VIDEO_HISTORY_BYTES=256*1024
export function verifyVideoReceipt(input:{receipt:any;projectId:string;brandId:string;ownerId:string;editor:any;revisions:any[];revisionsHasMore:boolean;existing?:any},token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN,now=Date.now()){
  const receipt=input.receipt||{}
  const issued=Date.parse(receipt.issuedAt)
  if(!['amc-video-lineage@1','amc-video-lineage@2'].includes(receipt.schemaVersion)||receipt.projectId!==input.projectId||receipt.brandId!==input.brandId||receipt.ownerId!==input.ownerId||receipt.editorActorId!==input.ownerId||!Number.isFinite(issued)||issued>now+60000||now-issued>15*60*1000||!Array.isArray(input.revisions)||input.revisions.length>100||Buffer.byteLength(JSON.stringify(input.revisions),'utf8')>VIDEO_HISTORY_BYTES)throw fail()
  if(receipt.editorDigest!==videoReceiptDigest(videoEditorPins(input.editor))||receipt.historyDigest!==videoReceiptDigest({revisions:input.revisions,hasMore:input.revisionsHasMore}))throw fail()
  if(input.existing&&Date.parse(input.existing.issuedAt)>issued)throw fail()
  const payload={schemaVersion:receipt.schemaVersion,projectId:receipt.projectId,brandId:receipt.brandId,ownerId:receipt.ownerId,editorActorId:receipt.editorActorId,editorDigest:receipt.editorDigest,historyDigest:receipt.historyDigest,...(receipt.schemaVersion==='amc-video-lineage@2'?{historyCursor:receipt.historyCursor}:{}),issuedAt:receipt.issuedAt}
  if(typeof receipt.signature!=='string'||!/^[a-f0-9]{64}$/.test(receipt.signature))throw fail()
  const signature=Buffer.from(receipt.signature,'hex')
  const valid=Boolean(token)&&timingSafeEqual(signature,createHmac('sha256',token!).update(JSON.stringify(payload)).digest())
  // A previously verified, byte-identical receipt remains retryable across key rotation
  // within its original TTL. Unseen old-key receipts must be refreshed by Content.
  const replay=input.existing&&videoReceiptDigest(input.existing)===videoReceiptDigest(receipt)
  if(!valid&&!replay)throw fail()
  return receipt
}
