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
  let storage=true
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/assetThumbnails.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {
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
  const route=fs.readFileSync('src/app/api/internal/content-assets/route.ts','utf8')
  assert.ok(route.indexOf('if (!isAuthorized(request))')<route.indexOf('thumbnailWorkerAction(body'))
  assert.match(route,/orderBy: \[\{ createdAt: 'desc' \}, \{ id: 'desc' \}\]/)
  await db.close()
  console.log('PASS: PostgreSQL thumbnail leases, retry budget, source revision, storage gating and public fields')
}
main().catch(error=>{console.error(error);process.exitCode=1})
