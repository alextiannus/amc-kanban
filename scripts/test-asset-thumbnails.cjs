const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')
async function main() {
  const db = new PGlite()
  await db.exec(`CREATE TABLE "MediaAsset" (id text PRIMARY KEY, "brandId" text, url text, "mimeType" text, "sizeBytes" int, "technicalMetadata" jsonb, "createdAt" timestamptz DEFAULT now());`)
  const query = async (strings,...values) => db.query(strings.map((s,i)=>s+(i<values.length?`$${i+1}`:'')).join(''),values)
  const prisma = { $queryRaw:async (...a)=>(await query(...a)).rows, $executeRaw:async (...a)=>(await query(...a)).affectedRows }
  prisma.$transaction=async task=>{await db.exec('BEGIN');try{const result=await task(prisma);await db.exec('COMMIT');return result}catch(error){await db.exec('ROLLBACK');throw error}}
  let storage=true
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/assetThumbnails.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, require:name=>name==='./prisma'?{prisma}:name.includes('huaweiObs')?{getHuaweiObsConfig:()=>storage?{}:null,
      getHuaweiObsPresignedPutUrl:({key})=>({uploadUrl:'https://obs.test/upload',publicUrl:`https://obs.test/${key}`,headers:{}})}:require(name), console,
  })
  const act=body=>exports.thumbnailWorkerAction(body,a=>a.url)
  const insert=async(id)=>db.query(`INSERT INTO "MediaAsset" VALUES ($1,'brand','https://source.test/a.jpg','image/jpeg',42,'{"width":800}',now())`,[id])
  await insert('a'); await insert('b')
  storage=false; assert.equal((await act({action:'thumbnailClaim'})).job,null); storage=true
  const first=(await act({action:'thumbnailClaim'})).job
  const second=(await act({action:'thumbnailClaim'})).job
  assert.notEqual(first.assetId,second.assetId,'Claims do not duplicate active work')
  assert.equal((await act({action:'thumbnailClaim'})).job,null)
  assert.equal((await act({action:'thumbnailFinish',assetId:first.assetId,token:'wrong'})).ok,false)
  assert.equal((await act({action:'thumbnailFinish',...first})).ok,true)
  let asset=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[first.assetId])).rows[0]
  assert.equal(asset.technicalMetadata.width,800,'Other technical metadata survives')
  assert.equal(exports.publicThumbnail(asset).thumbnailStatus,'ready')
  assert.match(exports.publicThumbnail(asset).thumbnailUrl,/\.webp$/)
  assert.equal(JSON.stringify(exports.publicThumbnail(asset)).includes('token'),false)
  asset.url+='?new-source'; assert.equal(exports.publicThumbnail(asset).thumbnailStatus,'pending')
  await db.query('UPDATE "MediaAsset" SET url=url || $1 WHERE id=$2',['?changed',second.assetId])
  assert.equal((await act({action:'thumbnailFinish',...second})).ok,false,'Source changes reject stale completion')
  let job=(await act({action:'thumbnailClaim'})).job
  assert.equal(job.assetId,second.assetId)
  await act({action:'thumbnailFinish',...job,error:'decode failed'})
  assert.equal((await act({action:'thumbnailClaim'})).job,null,'Failures back off')
  for(let attempt=2;attempt<=3;attempt++) {
    await db.exec(`UPDATE "MediaAsset" SET "technicalMetadata"=jsonb_set("technicalMetadata",'{thumbnail,retryAt}',to_jsonb(now()-interval '1 minute')) WHERE id='${job.assetId}'`)
    job=(await act({action:'thumbnailClaim'})).job
    assert.equal((await db.query('SELECT "technicalMetadata" FROM "MediaAsset" WHERE id=$1',[job.assetId])).rows[0].technicalMetadata.thumbnail.attempts,attempt)
    await act({action:'thumbnailFinish',...job,error:'failed'})
  }
  await db.exec(`UPDATE "MediaAsset" SET "technicalMetadata"=jsonb_set("technicalMetadata",'{thumbnail,retryAt}',to_jsonb(now()-interval '1 minute'))`)
  assert.equal((await act({action:'thumbnailClaim'})).job,null,'Retry budget is bounded')
  await insert('c')
  const expired=(await act({action:'thumbnailClaim'})).job
  await db.exec(`UPDATE "MediaAsset" SET "technicalMetadata"=jsonb_set("technicalMetadata",'{thumbnail,leaseUntil}',to_jsonb(now()-interval '1 minute')) WHERE id='c'`)
  job=(await act({action:'thumbnailClaim'})).job
  assert.notEqual(job.token,expired.token)
  assert.equal((await act({action:'thumbnailFinish',...expired})).ok,false)
  assert.equal((await act({action:'thumbnailFinish',...job})).ok,true)
  const prepare=exports.prepareAssetThumbnails
  await insert('old');await db.exec(`UPDATE "MediaAsset" SET "createdAt"=now()-interval '1 year' WHERE id='old'`)
  await insert('new')
  const prioritized=await prepare('brand',['old'],false)
  assert.equal(prioritized.scheduled,1)
  assert.equal((await prepare('brand',['old'],false)).scheduled,0,'Repeated priorities are deduplicated')
  job=(await act({action:'thumbnailClaim'})).job
  assert.equal(job.assetId,'old','Visible older material wins over newer historical work')
  await prepare('brand',['old'],true)
  assert.equal((await db.query(`SELECT "technicalMetadata"->'thumbnail'->>'token' AS token FROM "MediaAsset" WHERE id='old'`)).rows[0].token,job.token,'Prepare/retry never steals an active lease')
  await act({action:'thumbnailFinish',...job})
  await assert.rejects(prepare('brand',[]),error=>error.status===422)
  await assert.rejects(prepare('brand',Array.from({length:61},(_,i)=>String(i))),error=>error.status===422)
  await assert.rejects(prepare('brand',['new'],'true'),error=>error.status===422)
  await insert('foreign');await db.exec(`UPDATE "MediaAsset" SET "brandId"='other' WHERE id='foreign'`)
  await assert.rejects(prepare('brand',['new','foreign']),error=>error.status===404)
  assert.equal((await db.query(`SELECT "technicalMetadata"->'thumbnailPriority' AS priority FROM "MediaAsset" WHERE id='new'`)).rows[0].priority,null,'Mixed foreign IDs roll back all changes')
  const failed=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[second.assetId])).rows[0]
  assert.equal(exports.publicThumbnail(failed).thumbnailRetryable,true)
  await prepare('brand',[second.assetId],true)
  assert.equal((await db.query('SELECT "technicalMetadata" FROM "MediaAsset" WHERE id=$1',[second.assetId])).rows[0].technicalMetadata.thumbnail.attempts,0)
  job=(await act({action:'thumbnailClaim'})).job
  assert.equal(job.assetId,second.assetId)
  await act({action:'thumbnailFinish',...job,error:'temporary'})
  let retrying=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[job.assetId])).rows[0]
  assert.equal(exports.publicThumbnail(retrying).thumbnailStatus,'retrying')
  assert.equal(exports.publicThumbnail(retrying).thumbnailRetryable,false)
  await prepare('brand',[job.assetId],true)
  retrying=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[job.assetId])).rows[0]
  assert.equal(retrying.technicalMetadata.thumbnail.attempts,1,'Explicit retry cannot reset automatic retry budget')
  await insert('inaccessible');await prepare('brand',['inaccessible'],false)
  job=(await act({action:'thumbnailClaim'})).job
  assert.equal(job.assetId,'inaccessible')
  await act({action:'thumbnailFinish',...job,error:'Media HTTP 403',errorCode:'SOURCE_ACCESS_DENIED'})
  let inaccessible=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[job.assetId])).rows[0]
  assert.equal(exports.publicThumbnail(inaccessible).thumbnailStatus,'failed','Unavailable originals are failures, not queued work')
  assert.equal(exports.publicThumbnail(inaccessible).thumbnailRetryable,true)
  await db.query(`UPDATE "MediaAsset" SET "technicalMetadata"=jsonb_set("technicalMetadata",'{thumbnail,retryAt}',to_jsonb(now()-interval '1 minute')) WHERE id=$1`,[job.assetId])
  const other=(await act({action:'thumbnailClaim'})).job
  assert.notEqual(other?.assetId,job.assetId,'Unavailable originals do not consume automatic retry loops')
  await prepare('brand',[job.assetId],true)
  inaccessible=(await db.query('SELECT * FROM "MediaAsset" WHERE id=$1',[job.assetId])).rows[0]
  assert.equal(inaccessible.technicalMetadata.thumbnail.attempts,0,'An explicit retry can restart after source repair')
  const route=fs.readFileSync('src/app/api/internal/content-assets/route.ts','utf8')
  assert.ok(route.indexOf('if (!isAuthorized(request))')<route.indexOf('thumbnailWorkerAction(body'))
  assert.ok(route.indexOf('if (!await canSessionAccessBrandProject')<route.indexOf("body.action === 'prepareThumbnails'"),'Brand access is checked before preparation')
  assert.match(route,/orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\]/)
  await db.close()
  console.log('PASS: PostgreSQL thumbnail leases, retry budget, source revision, storage gating and public fields')
}
main().catch(error=>{console.error(error);process.exitCode=1})
