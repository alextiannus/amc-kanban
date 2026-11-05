const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const { PGlite } = require('@electric-sql/pglite')
const compile = (file, deps) => {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => { assert(name in deps, name); return deps[name] }, console, Set, Map, Object, Number, JSON, Error })
  return exports
}
let activeDb
async function main() {
  const pg = activeDb = new PGlite()
  await pg.exec(`CREATE TABLE "Brand" (id text PRIMARY KEY, industry text, "assetFoldersInitialized" boolean DEFAULT false);
    CREATE TABLE "BrandFolder" (id text PRIMARY KEY, "brandId" text REFERENCES "Brand"(id), name text, "parentId" text REFERENCES "BrandFolder"(id), "systemKey" text, "folderKind" text DEFAULT 'CUSTOM', "templateVersion" text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), UNIQUE("brandId",name), UNIQUE("brandId","systemKey"));
    CREATE TABLE "MediaAsset" (id text PRIMARY KEY, "brandId" text REFERENCES "Brand"(id), "folderId" text REFERENCES "BrandFolder"(id), "aiCategory" text, "sourceType" text DEFAULT 'upload', "mimeType" text, url text, filename text, "sizeBytes" int, "aiTags" jsonb DEFAULT '[]', "manualOverrides" jsonb, "imageAnalysis" jsonb, "technicalMetadata" jsonb, "updatedAt" timestamptz DEFAULT now());
    CREATE TABLE "ContentDraft" (id text PRIMARY KEY, "brandId" text REFERENCES "Brand"(id), "coverAssetId" text REFERENCES "MediaAsset"(id), "updatedAt" timestamptz DEFAULT now());
    CREATE TABLE "AuditLog" (id text PRIMARY KEY, "actorId" text, "actorType" text, action text, "resourceType" text, "resourceId" text, metadata jsonb);
    INSERT INTO "Brand" (id,industry) VALUES ('brand','restaurant'),('other','restaurant');`)
  await pg.exec(fs.readFileSync('prisma/migrations/20261104090000_material_folder_management/migration.sql', 'utf8'))
  await pg.exec(fs.readFileSync('prisma/migrations/20261104170000_cover_material_purpose/migration.sql', 'utf8'))
  const json = new Set(['aiTags', 'manualOverrides', 'imageAnalysis', 'technicalMetadata', 'metadata'])
  const whereSQL = (where, values) => Object.entries(where || {}).map(([key, value]) => {
    if (key === 'OR' || key === 'AND') return `(${value.map(v => whereSQL(v, values)).join(key === 'OR' ? ' OR ' : ' AND ')})`
    if (key === 'brandId_name' || key === 'brandId_systemKey') return whereSQL(value, values)
    if (value === null) return `"${key}" IS NULL`
    if (typeof value === 'object' && value && 'not' in value) { if(value.not===null)return `"${key}" IS NOT NULL`;values.push(value.not);return `"${key}"<>$${values.length}` }
    if (typeof value === 'object' && value && 'in' in value) { values.push(value.in); return `"${key}" = ANY($${values.length})` }
    values.push(value); return `"${key}"=$${values.length}`
  }).join(' AND ') || 'TRUE'
  const db = {}
  for (const [model, table] of Object.entries({ brand: 'Brand', brandFolder: 'BrandFolder', mediaAsset: 'MediaAsset', auditLog: 'AuditLog', contentDraft: 'ContentDraft' })) {
    const findMany = async ({ where, orderBy } = {}) => {
      const values = []; const cond = whereSQL(where, values)
      return (await pg.query(`SELECT * FROM "${table}" WHERE ${cond}`, values)).rows
    }
    const updateMany = async ({ where, data }) => {
      const values = []; const assignments = []
      if (data.parent) { data = { ...data, parentId: data.parent.connect?.id || null }; delete data.parent }
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'increment' in value) { assignments.push(`"${key}"="${key}"+${Number(value.increment)}`); continue }
        values.push(json.has(key) ? JSON.stringify(value) : value); assignments.push(`"${key}"=$${values.length}`)
      }
      if (table !== 'AuditLog' && table !== 'Brand') assignments.push('"updatedAt"=clock_timestamp()')
      const cond = whereSQL(where, values)
      const result = await pg.query(`UPDATE "${table}" SET ${assignments.join(',')} WHERE ${cond} RETURNING *`, values)
      return result.rows
    }
    db[model] = {
      findMany, findFirst: async q => (await findMany(q))[0] || null, findUnique: async q => (await findMany(q))[0] || null,
      findUniqueOrThrow: async q => { const row = (await findMany(q))[0]; assert(row); return row },
      count: async q => (await findMany(q)).length,
      create: async ({ data }) => {
        const row = { id: randomUUID(), ...data }; const keys = Object.keys(row).filter(k => row[k] !== undefined)
        try { return (await pg.query(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map(k => json.has(k) ? JSON.stringify(row[k]) : row[k]))).rows[0] }
        catch (e) { if (e.code === '23505') e.code = 'P2002'; throw e }
      },
      update: async q => (await updateMany(q))[0], updateMany: async q => ({ count: (await updateMany(q)).length }),
      delete: async ({ where }) => { const values = []; await pg.query(`DELETE FROM "${table}" WHERE ${whereSQL(where, values)}`, values) },
      groupBy: async () => (await pg.query('SELECT "folderId", "aiCategory", "materialClass", count(*)::int AS n FROM "MediaAsset" WHERE "brandId"=\'brand\' GROUP BY "folderId","aiCategory","materialClass"')).rows.map(r => ({ ...r, _count: { _all: r.n } })),
    }
  }
  db.$queryRaw = async (strings, ...values) => (await pg.query(strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : '')).join(''), values)).rows
  let tail = Promise.resolve()
  db.$transaction = task => { const promise = tail.then(async () => { await pg.exec('BEGIN'); try { const result = await task(db); await pg.exec('COMMIT'); return result } catch(e) { await pg.exec('ROLLBACK'); throw e } }); tail = promise.catch(() => {}); return promise }
  const policy = compile('src/lib/asset-library/material-policy.ts', {})
  const templates = compile('src/lib/asset-library/templates.ts', {})
  const analysisPolicy = compile('src/lib/asset-analysis/policy.ts', { '../asset-library/templates.ts': templates })
  const folders = compile('src/lib/asset-analysis/folders.ts', { '@/lib/asset-analysis/db': { prisma: db }, '../asset-library/templates.ts': templates })
  const management = compile('src/lib/asset-library/folder-management.ts', { './material-policy.ts': policy, '../asset-analysis/folders': folders, '../asset-analysis/policy': analysisPolicy, './roots': compile('src/lib/asset-library/roots.ts', {}) })
  const coverPolicy = compile('src/lib/asset-library/cover-policy.ts', {})
  const covers = compile('src/lib/asset-library/covers.ts', { './cover-policy': coverPolicy, '../publishMediaValidation': { inspectStoredMedia: async asset => ({ kind: 'image', mimeType: asset.url.includes('spoof') ? 'image/webp' : asset.mimeType, sizeBytes: 100 }) } })
  const filing = compile('src/lib/asset-library/filing.ts', { './material-policy.ts': policy, '../asset-analysis/folders': folders, './cover-policy': coverPolicy, './covers': covers })
  const actor = { id: 'writer', type: 'HUMAN' }
  await Promise.all([folders.ensureAssetFolders('brand'), folders.ensureAssetFolders('brand')])
  assert.equal(await db.brandFolder.count({ where: { brandId: 'brand' } }), 12)
  let standard = await db.brandFolder.findUnique({ where: { brandId_systemKey: { brandId: 'brand', systemKey: 'original_video' } } })
  standard = await management.editFolder(db, 'brand', actor, { folderId: standard.id, revision: standard.revision, name: '拍摄原片' })
  await folders.ensureAssetFolders('brand')
  assert.equal(await db.brandFolder.count({ where: { brandId: 'brand' } }), 12)
  assert.equal((await db.brandFolder.findUnique({ where: { id: standard.id } })).name, '拍摄原片')
  const child = await management.createFolder(db, 'brand', actor, { parentId: standard.id, name: '十一月拍摄' })
  const leaf = await management.createFolder(db, 'brand', actor, { parentId: child.id, name: '门店一' })
  await assert.rejects(management.createFolder(db, 'brand', actor, { parentId: leaf.id, name: '第四级' }), /三级/)
  await assert.rejects(management.editFolder(db, 'brand', actor, { folderId: child.id, revision: 1, parentId: leaf.id }), /自己|子目录/)
  await assert.rejects(management.createFolder(db, 'brand', actor, { parentId: 'foreign', name: '不可创建' }), /不存在/)
  await assert.rejects(management.removeFolder(db, 'brand', actor, { folderId: standard.id, revision: 1 }), /变化|不可删除/)
  await assert.rejects(management.removeFolder(db, 'brand', actor, { folderId: child.id, revision: 1 }), /非空/)
  const currentChild = await db.brandFolder.findUnique({ where: { id: child.id } })
  const race = await Promise.allSettled(['操作一', '操作二'].map(name => management.editFolder(db, 'brand', actor, { folderId: child.id, revision: currentChild.revision, name })))
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1)
  const manual = await management.createFolder(db, 'brand', actor, { name: '人工成片', materialClass: 'MANUAL' })
  await assert.rejects(management.editFolder(db, 'brand', actor, { folderId: manual.id, revision: 0, parentId: standard.id }), /同类别/)
  const unknown = await filing.createClassifiedAsset(db, 'brand', {}, { brandId: 'brand', url: 'https://fixture/unknown', mimeType: 'image/jpeg', sourceType: 'huawei_obs' })
  assert.equal(unknown.materialClass, 'UNCONFIRMED'); assert.equal(unknown.folderId, null)
  const original = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'ORIGINAL', folderId: leaf.id }, { brandId: 'brand', url: 'https://fixture/original', mimeType: 'image/jpeg' })
  const fallbackUpload = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'MANUAL', folder: '素材库', aiCategory: '旧创意建议分类' }, { brandId: 'brand', url: 'https://fixture/fallback-upload', mimeType: 'image/jpeg' })
  assert.equal(fallbackUpload.materialClass, 'MANUAL')
  await filing.updateAssetFiling(db, 'brand', actor, [fallbackUpload.id], { folderId: manual.id })
  assert.equal(original.folderId, leaf.id)
  const [sameClass] = await filing.updateAssetFiling(db, 'brand', actor, [original.id], { materialClass: 'ORIGINAL' })
  assert.equal(sameClass.folderId, leaf.id, 'saving the same class preserves an existing child folder')

  const ai = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'ORIGINAL' }, { brandId: 'brand', url: 'https://fixture/ai', mimeType: 'image/jpeg', sourceType: 'designer' })
  assert.equal(ai.materialClass, 'AI')
  const replay = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { id: ai.id, brandId: 'brand', url: ai.url, mimeType: 'image/jpeg', sourceType: 'designer' })
  assert.equal(replay.id, ai.id)
  await assert.rejects(filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { id: ai.id, brandId: 'brand', url: 'https://fixture/different', mimeType: 'image/jpeg' }), /其他文件/)
  const generatedUpload = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { brandId: 'brand', url: 'https://fixture/designer-upload', mimeType: 'image/jpeg', sourceType: 'huawei_obs' }, { knownAiGenerated: true })
  assert.equal(generatedUpload.materialClass, 'AI', 'generation entry class is independent of storage channel')
  assert.equal(generatedUpload.technicalMetadata.materialProvenance.origin, 'AI_GENERATION')
  await assert.rejects(filing.updateAssetFiling(db, 'brand', actor, [generatedUpload.id], { materialClass: 'ORIGINAL', confirmMaterialClassChange: true }), /AI/)
  const declaredAi = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI', knownAiGenerated: true }, { brandId: 'brand', url: 'https://fixture/user-declared-ai', mimeType: 'image/jpeg', sourceType: 'huawei_obs' })
  assert.equal(declaredAi.technicalMetadata, null, 'client payload cannot forge trusted provenance')
  const [correctedLabel] = await filing.updateAssetFiling(db, 'brand', actor, [declaredAi.id], { materialClass: 'ORIGINAL', confirmMaterialClassChange: true })
  assert.equal(correctedLabel.materialClass, 'ORIGINAL', 'a mistaken user label can still be explicitly corrected')

  await assert.rejects(filing.updateAssetFiling(db, 'brand', actor, [original.id], { folderId: manual.id }), /确认/)
  const [moved] = await filing.updateAssetFiling(db, 'brand', actor, [original.id], { folderId: manual.id, confirmMaterialClassChange: true, materialForm: 'FINISHED' })
  assert.equal(moved.id, original.id); assert.equal(moved.url, original.url); assert.equal(moved.materialClass, 'MANUAL'); assert.equal(moved.manualOverrides.folder, true)
  await assert.rejects(filing.updateAssetFiling(db, 'brand', actor, [ai.id], { materialClass: 'ORIGINAL', confirmMaterialClassChange: true }), /AI/)
  await assert.rejects(filing.updateAssetFiling(db, 'other', actor, [original.id], { materialClass: 'ORIGINAL', confirmMaterialClassChange: true }), /品牌/)
  await assert.rejects(management.removeFolder(db, 'brand', actor, { folderId: manual.id, revision: 0 }), /非空/)
  const writable = await management.presentFolders(db, 'brand', true), readonly = await management.presentFolders(db, 'brand', false)
  assert(writable.find(f => f.id === standard.id).canRename)
  assert(!writable.find(f => f.id === standard.id).canMove)
  assert(readonly.every(f => !f.canCreateChild && !f.canRename && !f.canMove && !f.canDelete))
  const empty = await management.createFolder(db, 'brand', actor, { name: '空目录', materialClass: 'MANUAL' })
  await management.removeFolder(db, 'brand', actor, { folderId: empty.id, revision: 0 })
  assert.equal(await db.brandFolder.findUnique({ where: { id: empty.id } }), null)
  const aiDefault = await db.brandFolder.findUnique({ where: { brandId_systemKey: { brandId: 'brand', systemKey: 'processed_manual' } } })
  await management.removeFolder(db, 'brand', actor, { folderId: aiDefault.id, revision: 0 })
  await folders.ensureAssetFolders('brand')
  assert.equal(await db.brandFolder.findUnique({ where: { id: aiDefault.id } }), null)
  // Fixed navigation roots are immutable and do not count as business depth.
  assert.equal(management.presentRoots(true).length, 3)
  assert(management.presentRoots(true).every(r => r.canCreateChild && !r.canRename && !r.canMove && !r.canDelete))
  assert(management.presentRoots(false).every(r => !r.canCreateChild))
  const originalTopic = await management.createFolder(db, 'brand', actor, { name: '新实拍主题', materialClass: 'ORIGINAL' })
  assert.equal(originalTopic.materialClass, 'ORIGINAL')
  const organize = compile('src/lib/asset-library/organize.ts', { '@prisma/client': { Prisma: { DbNull: null } }, '../asset-analysis/folders': folders, './filing': filing, './material-policy': policy })
  const currentAsset = await db.mediaAsset.findUnique({ where: { id: original.id } })
  await assert.rejects(filing.updateAssetFiling(db, 'brand', actor, [original.id], { materialClass: 'ORIGINAL', revisions: { [original.id]: 'old' }, confirmMaterialClassChange: true }), /预览/)
  const receipt = {}
  const [organized] = await filing.updateAssetFiling(db, 'brand', actor, [original.id], { folderId: originalTopic.id, materialClass: 'ORIGINAL', revisions: { [original.id]: currentAsset.updatedAt.toISOString() }, confirmMaterialClassChange: true }, receipt)
  assert(receipt.id)
  assert.equal(organized.url, original.url)
  await organize.rollbackOrganization(db, 'brand', actor, receipt.id)
  const restored = await db.mediaAsset.findUnique({ where: { id: original.id } })
  assert.equal(restored.folderId, currentAsset.folderId); assert.equal(restored.materialClass, currentAsset.materialClass)
  await assert.rejects(organize.rollbackOrganization(db, 'brand', actor, receipt.id), /修改/)
  await assert.rejects(organize.rollbackOrganization(db, 'other', actor, receipt.id), /回执/)
  await filing.createClassifiedAsset(db, 'brand', { materialClass: 'ORIGINAL', folderId: originalTopic.id }, { brandId: 'brand', url: 'https://fixture/counted-original', mimeType: 'image/jpeg' })
  await db.mediaAsset.create({ data: { brandId: 'brand', url: 'https://fixture/legacy-pending', folderId: originalTopic.id, aiCategory: originalTopic.name, materialClass: 'UNCONFIRMED', materialForm: 'UNKNOWN' } })
  const countsForTopic = (await management.presentFolders(db, 'brand', true)).find(f => f.id === originalTopic.id)
  assert.equal(countsForTopic.assetCount, 2, 'Deletion considers all assets regardless of class')
  assert.equal(countsForTopic.subtreeAssetCount, 1, 'Navigation counts only the root class')
  assert.equal(countsForTopic.pendingAssetCount, 1, 'Pending history is counted separately')
  const listing = compile('src/lib/asset-library/list-query.ts', { './material-policy': policy, './cover-policy': coverPolicy })
  const q = listing.assetListQuery(new URLSearchParams('root=ORIGINAL&page=2&pageSize=24&usage=unused&assetType=video&since=7&materialForm=CLIP'), ['brand'], [])
  assert.equal(q.page, 2); assert.equal(q.where.materialClass, 'ORIGINAL'); assert.equal(q.where.usedCount, 0); assert.equal(q.where.mimeType.startsWith, 'video/'); assert.equal(q.where.materialForm, 'CLIP')
  assert.throws(() => listing.assetListQuery(new URLSearchParams('page=-1'), ['brand'], []))
  assert.throws(() => listing.assetListQuery(new URLSearchParams('folderId=foreign'), ['brand'], []), /目录/)
  // Cover purpose is independent of source classification and folder placement.
  const coverSnapshot = await db.mediaAsset.findUnique({ where: { id: original.id } })
  const [markedCover] = await filing.updateAssetFiling(db, 'brand', actor, [original.id], { isCoverMaterial: true })
  assert.equal(markedCover.isCoverMaterial, true); assert.equal(markedCover.folderId, coverSnapshot.folderId); assert.equal(markedCover.materialClass, coverSnapshot.materialClass)
  assert.equal(markedCover.url, coverSnapshot.url)
  for (const materialClass of ['AI','MANUAL','UNCONFIRMED']) {
    const asset = await filing.createClassifiedAsset(db, 'brand', { materialClass, isCoverMaterial: true }, { brandId: 'brand', url: `https://fixture/cover-${materialClass}`, mimeType: 'image/png', technicalMetadata: { kind:'image', mimeType:'image/png', sizeBytes:100 } })
    assert.equal(asset.isCoverMaterial, true); assert.equal(asset.materialClass, materialClass)
  }
  const unsupported = await db.mediaAsset.create({ data: { brandId:'brand', url:'https://fixture/video', mimeType:'video/mp4' } })
  const spoof = await db.mediaAsset.create({ data: { brandId:'brand', url:'https://fixture/spoof', mimeType:'image/jpeg' } })
  await assert.rejects(filing.updateAssetFiling(db,'brand',actor,[unsupported.id],{isCoverMaterial:true}),/JPEG/)
  await assert.rejects(filing.updateAssetFiling(db,'brand',actor,[spoof.id],{isCoverMaterial:true}),/JPEG/)
  await assert.rejects(filing.updateAssetFiling(db,'brand',actor,[original.id,unsupported.id],{isCoverMaterial:true}),/JPEG/)
  await assert.rejects(filing.updateAssetFiling(db,'other',actor,[original.id],{isCoverMaterial:true}),/品牌/)
  await assert.rejects(filing.updateAssetFiling(db,'brand',actor,[original.id],{isCoverMaterial:'true'}),/布尔/)
  const coverQuery = listing.assetListQuery(new URLSearchParams('coverOnly=true&page=1'), ['brand'], [])
  assert.throws(()=>listing.assetListQuery(new URLSearchParams('materialClass=COVERS'),['brand'],[]),/类别/)
  assert.equal(listing.assetListQuery(new URLSearchParams('root=COVERS'),['brand'],[]).where.isCoverMaterial,true)
  assert.equal(coverQuery.where.isCoverMaterial,true);assert.equal(coverQuery.where.materialClass,undefined)
  assert.throws(()=>listing.assetListQuery(new URLSearchParams('coverOnly=1'),['brand'],[]),/封面筛选/)
  // Failed saves roll back purpose changes; existing draft references survive unmarking.
  const saveCandidate = await db.mediaAsset.create({data:{brandId:'brand',url:'https://fixture/draft-cover',mimeType:'image/jpeg'}})
  const [proof] = await covers.prepareCoverAssets(db,'brand',[saveCandidate.id])
  await assert.rejects(db.$transaction(async tx=>{await tx.contentDraft.create({data:{id:'failed-cover-draft',brandId:'brand',coverAssetId:proof.id}});await covers.markDraftCover(tx,'brand',actor,proof,'failed-cover-draft');throw Error('save failed')}),/save failed/)
  assert.equal((await db.mediaAsset.findUnique({where:{id:proof.id}})).isCoverMaterial,false)
  await db.$transaction(async tx=>{await tx.contentDraft.create({data:{id:'saved-cover-draft',brandId:'brand',coverAssetId:proof.id}});await covers.markDraftCover(tx,'brand',actor,proof,'saved-cover-draft')})
  assert.equal((await db.mediaAsset.findUnique({where:{id:proof.id}})).isCoverMaterial,true)
  await db.$transaction(tx=>covers.markDraftCover(tx,'brand',actor,proof,'parallel-platform-draft'))
  await filing.updateAssetFiling(db,'brand',actor,[proof.id],{isCoverMaterial:false})
  assert.equal((await db.contentDraft.findUnique({where:{id:'saved-cover-draft'}})).coverAssetId,proof.id)
  await assert.rejects(db.$transaction(tx=>covers.markDraftCover(tx,'brand',actor,proof,'saved-cover-draft')),/变化/)
  const statsCover = await db.mediaAsset.create({data:{brandId:'brand',url:'https://fixture/stats-cover',mimeType:'image/jpeg'}})
  const [statsProof] = await covers.prepareCoverAssets(db,'brand',[statsCover.id])
  await db.mediaAsset.update({where:{id:statsCover.id},data:{aiCategory:'已使用'}})
  await db.$transaction(tx=>covers.markDraftCover(tx,'brand',actor,statsProof,'stats-draft'))
  assert.equal((await db.mediaAsset.findUnique({where:{id:statsCover.id}})).aiCategory,'已使用','Usage updates are retained when adding a cover purpose')
  const history = compile('src/lib/asset-library/cover-history.ts', { '@prisma/client':{Prisma:{DbNull:null}}, './cover-policy':coverPolicy,'./material-policy':policy,'./filing':filing,'../asset-analysis/folders':folders })
  const legacy = await db.brandFolder.create({data:{brandId:'brand',name:'封面图',materialClass:'MANUAL',folderKind:'CUSTOM'}})
  const childCover = await management.createFolder(db,'brand',actor,{name:'节日封面',parentId:legacy.id})
  const historical = await db.mediaAsset.create({data:{brandId:'brand',url:'https://fixture/old-cover',mimeType:'image/png',folderId:childCover.id,materialClass:'UNCONFIRMED'}})
  const draftOnlyCover = await db.mediaAsset.create({data:{brandId:'brand',url:'https://fixture/draft-only-cover',mimeType:'image/jpeg',materialClass:'AI'}})
  await db.contentDraft.create({data:{id:'historic-draft',brandId:'brand',coverAssetId:draftOnlyCover.id}})
  const firstPreview = await history.previewCoverBackfill(db,'brand')
  assert(firstPreview.entries.some(a=>a.id===historical.id));assert(firstPreview.entries.some(a=>a.id===draftOnlyCover.id));assert(!firstPreview.entries.some(a=>a.id===proof.id),'Manually unmarked draft covers must not return')
  const receiptCover = await history.applyCoverBackfill(db,firstPreview,actor)
  const afterCover = await db.mediaAsset.findUnique({where:{id:historical.id}})
  assert.equal(afterCover.isCoverMaterial,true);assert.equal(afterCover.folderId,childCover.id);assert.equal(afterCover.materialClass,'UNCONFIRMED')
  await assert.rejects(history.applyCoverBackfill(db,firstPreview,actor),/修改/)
  await history.rollbackCoverBackfill(db,'brand',receiptCover.receiptId,actor)
  assert.equal((await db.mediaAsset.findUnique({where:{id:historical.id}})).isCoverMaterial,false)
  await assert.rejects(history.rollbackCoverBackfill(db,'brand',receiptCover.receiptId,actor),/修改/)
  const staleCoverPreview = await history.previewCoverBackfill(db,'brand')
  await db.mediaAsset.update({where:{id:historical.id},data:{aiCategory:'changed'}})
  await assert.rejects(history.applyCoverBackfill(db,staleCoverPreview,actor),/修改/)
  // Execute the actual route with current permission grants, including revoked keys.
  let write = false, read = true, session = { user: actor }, validKey = true
  const route = compile('src/app/api/brands/[id]/folders/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getSession: async () => session, extractApiKey: r => r.headers.get('x-key'), getAgentFromApiKey: async () => validKey ? actor : null },
    '@/lib/asset-analysis/db': { prisma: db }, '@/lib/brandAccess': { canSessionAccessBrandProject: async () => read, canSessionWriteBrandProject: async () => write },
    '@/lib/asset-analysis/folders': folders, '@/lib/asset-library/folder-management': management, '@/lib/asset-library/cover-policy': coverPolicy,
  })
  const params = { params: Promise.resolve({ id: 'brand' }) }
  assert.equal((await route.POST(new Request('https://fixture', { method: 'POST', body: '{}' }), params)).status, 403)
  read = false; assert.equal((await route.GET(new Request('https://fixture'), params)).status, 404)
  read = true; session = null; validKey = false
  assert.equal((await route.GET(new Request('https://fixture', { headers: { 'x-key': 'revoked' } }), params)).status, 401)
  const assetRoute = compile('src/app/api/brands/[id]/assets/[assetId]/route.ts', {
    'next/server':{NextResponse:Response},'@/lib/auth':{getSession:async()=>({user:actor}),extractApiKey:()=>null,getAgentFromApiKey:async()=>null},'@/lib/prisma':{prisma:db},'@/lib/brandAccess':{canSessionAccessBrandProject:async()=>read,canSessionWriteBrandProject:async()=>write},'@/lib/designer':{},'@/lib/brand-plan/calendarSync':{},'@/lib/asset-analysis/folders':folders,'@/lib/asset-library/filing':filing,
  })
  read=true;write=false
  const coverRequest=()=>new Request('https://fixture',{method:'PATCH',body:JSON.stringify({isCoverMaterial:true})})
  assert.equal((await assetRoute.PATCH(coverRequest(),{params:Promise.resolve({id:'brand',assetId:historical.id})})).status,403)
  write=true;read=false
  assert.equal((await assetRoute.PATCH(coverRequest(),{params:Promise.resolve({id:'brand',assetId:historical.id})})).status,404)
  read=true
  assert.equal((await assetRoute.PATCH(coverRequest(),{params:Promise.resolve({id:'other',assetId:historical.id})})).status,404)
  // The cleanup cover destination is a purpose action, never a source class/folder move.
  const organizeRoute = compile('src/app/api/brands/[id]/assets/organize/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getSession: async () => session },
    '@/lib/prisma': { prisma: db }, '@/lib/brandAccess': { canSessionAccessBrandProject: async () => read, canSessionWriteBrandProject: async () => write },
    '@/lib/asset-library/filing': filing, '@/lib/asset-library/organize': organize, '@/lib/asset-library/cover-history': history,
  })
  const cleanupCover = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'UNCONFIRMED' }, { brandId:'brand', url:'https://fixture/cleanup-cover', mimeType:'image/png', technicalMetadata:{kind:'image',mimeType:'image/png',sizeBytes:100} })
  const cleanupPayload = { action:'cover', assetIds:[cleanupCover.id], revisions:{[cleanupCover.id]:cleanupCover.updatedAt.toISOString()}, confirmCoverPurpose:true, materialClass:'ORIGINAL', folderId:originalTopic.id }
  const callOrganize = (body, brandId='brand') => organizeRoute.POST(new Request('https://fixture', {method:'POST',body:JSON.stringify(body)}), {params:Promise.resolve({id:brandId})})
  session=null; assert.equal((await callOrganize(cleanupPayload)).status,401)
  session={user:actor}; write=false; assert.equal((await callOrganize(cleanupPayload)).status,403)
  write=true; read=false; assert.equal((await callOrganize(cleanupPayload)).status,404); read=true
  assert.equal((await callOrganize({...cleanupPayload, confirmCoverPurpose:false})).status,400)
  assert.equal((await callOrganize({...cleanupPayload, revisions:undefined})).status,400)
  assert.equal((await callOrganize({...cleanupPayload, revisions:[]})).status,400)
  assert.equal((await callOrganize({...cleanupPayload, revisions:{[cleanupCover.id]:'old'}})).status,409)
  assert.equal((await callOrganize(cleanupPayload,'other')).status,404)
  assert.equal((await callOrganize({...cleanupPayload,assetIds:[cleanupCover.id,unsupported.id],revisions:{...cleanupPayload.revisions,[unsupported.id]:unsupported.updatedAt.toISOString()}})).status,422)
  assert.equal((await db.mediaAsset.findUnique({where:{id:cleanupCover.id}})).isCoverMaterial,false, 'Mixed-format failure must be atomic')
  const savedCoverResponse=await callOrganize(cleanupPayload)
  assert.equal(savedCoverResponse.status,200)
  const savedCover=await savedCoverResponse.json()
  assert.equal(savedCover.rollbackAction,'rollback-cover'); assert(savedCover.receiptId)
  const cleanupAfter=await db.mediaAsset.findUnique({where:{id:cleanupCover.id}})
  assert.equal(cleanupAfter.isCoverMaterial,true)
  assert.equal(cleanupAfter.folderId,cleanupCover.folderId); assert.equal(cleanupAfter.materialClass,'UNCONFIRMED'); assert.equal(cleanupAfter.url,cleanupCover.url)
  assert.equal((await callOrganize(cleanupPayload)).status,409, 'Stale cover preview must not apply')
  write=false; assert.equal((await callOrganize({action:'rollback-cover',receiptId:savedCover.receiptId})).status,403); write=true
  assert.equal((await callOrganize({action:'rollback-cover',receiptId:savedCover.receiptId},'other')).status,409)
  assert.equal((await callOrganize({action:'rollback-cover',receiptId:savedCover.receiptId})).status,200)
  const cleanupRestored=await db.mediaAsset.findUnique({where:{id:cleanupCover.id}})
  assert.equal(cleanupRestored.isCoverMaterial,false); assert.equal(cleanupRestored.folderId,cleanupCover.folderId); assert.deepEqual(cleanupRestored.manualOverrides,cleanupCover.manualOverrides)
  assert.equal((await callOrganize({action:'rollback-cover',receiptId:savedCover.receiptId})).status,409, 'Replayed rollback must fail')
  assert((await db.auditLog.count()) > 5)
  await pg.close()
  console.log('PASS material folders: additive migration, real SQL tree/filing transactions, revision races, rename seeding, permissions, brand isolation, AI protection and reference identity')
}
main().catch(async e => { console.error(e); if (activeDb) await activeDb.close(); process.exitCode = 1 })
