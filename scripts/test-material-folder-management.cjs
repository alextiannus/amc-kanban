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
async function main() {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE "Brand" (id text PRIMARY KEY, industry text, "assetFoldersInitialized" boolean DEFAULT false);
    CREATE TABLE "BrandFolder" (id text PRIMARY KEY, "brandId" text REFERENCES "Brand"(id), name text, "parentId" text REFERENCES "BrandFolder"(id), "systemKey" text, "folderKind" text DEFAULT 'CUSTOM', "templateVersion" text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), UNIQUE("brandId",name), UNIQUE("brandId","systemKey"));
    CREATE TABLE "MediaAsset" (id text PRIMARY KEY, "brandId" text REFERENCES "Brand"(id), "folderId" text REFERENCES "BrandFolder"(id), "aiCategory" text, "sourceType" text DEFAULT 'upload', "mimeType" text, url text, "aiTags" jsonb DEFAULT '[]', "manualOverrides" jsonb, "imageAnalysis" jsonb, "updatedAt" timestamptz DEFAULT now());
    CREATE TABLE "AuditLog" (id text PRIMARY KEY, "actorId" text, "actorType" text, action text, "resourceType" text, "resourceId" text, metadata jsonb);
    INSERT INTO "Brand" (id,industry) VALUES ('brand','restaurant'),('other','restaurant');`)
  await pg.exec(fs.readFileSync('prisma/migrations/20261104090000_material_folder_management/migration.sql', 'utf8'))
  const json = new Set(['aiTags', 'manualOverrides', 'imageAnalysis', 'metadata'])
  const whereSQL = (where, values) => Object.entries(where || {}).map(([key, value]) => {
    if (key === 'OR' || key === 'AND') return `(${value.map(v => whereSQL(v, values)).join(key === 'OR' ? ' OR ' : ' AND ')})`
    if (key === 'brandId_name' || key === 'brandId_systemKey') return whereSQL(value, values)
    if (value === null) return `"${key}" IS NULL`
    if (typeof value === 'object' && value && 'in' in value) { values.push(value.in); return `"${key}" = ANY($${values.length})` }
    values.push(value); return `"${key}"=$${values.length}`
  }).join(' AND ') || 'TRUE'
  const db = {}
  for (const [model, table] of Object.entries({ brand: 'Brand', brandFolder: 'BrandFolder', mediaAsset: 'MediaAsset', auditLog: 'AuditLog' })) {
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
      groupBy: async () => (await pg.query('SELECT "folderId", "aiCategory", count(*)::int AS n FROM "MediaAsset" WHERE "brandId"=\'brand\' GROUP BY "folderId","aiCategory"')).rows.map(r => ({ ...r, _count: { _all: r.n } })),
    }
  }
  db.$queryRaw = async (strings, ...values) => (await pg.query(strings.map((s, i) => s + (i < values.length ? `$${i + 1}` : '')).join(''), values)).rows
  let tail = Promise.resolve()
  db.$transaction = task => { const promise = tail.then(async () => { await pg.exec('BEGIN'); try { const result = await task(db); await pg.exec('COMMIT'); return result } catch(e) { await pg.exec('ROLLBACK'); throw e } }); tail = promise.catch(() => {}); return promise }
  const policy = compile('src/lib/asset-library/material-policy.ts', {})
  const templates = compile('src/lib/asset-library/templates.ts', {})
  const analysisPolicy = compile('src/lib/asset-analysis/policy.ts', { '../asset-library/templates.ts': templates })
  const folders = compile('src/lib/asset-analysis/folders.ts', { '@/lib/asset-analysis/db': { prisma: db }, '../asset-library/templates.ts': templates })
  const management = compile('src/lib/asset-library/folder-management.ts', { './material-policy.ts': policy, '../asset-analysis/folders': folders, '../asset-analysis/policy': analysisPolicy })
  const filing = compile('src/lib/asset-library/filing.ts', { './material-policy.ts': policy, '../asset-analysis/folders': folders })
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
  assert.equal(original.folderId, leaf.id)
  const ai = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'ORIGINAL' }, { brandId: 'brand', url: 'https://fixture/ai', mimeType: 'image/jpeg', sourceType: 'designer' })
  assert.equal(ai.materialClass, 'AI')
  const replay = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { id: ai.id, brandId: 'brand', url: ai.url, mimeType: 'image/jpeg', sourceType: 'designer' })
  assert.equal(replay.id, ai.id)
  await assert.rejects(filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { id: ai.id, brandId: 'brand', url: 'https://fixture/different', mimeType: 'image/jpeg' }), /其他文件/)
  const generatedUpload = await filing.createClassifiedAsset(db, 'brand', { materialClass: 'AI' }, { brandId: 'brand', url: 'https://fixture/designer-upload', mimeType: 'image/jpeg', sourceType: 'huawei_obs' })
  assert.equal(generatedUpload.materialClass, 'AI', 'generation entry class is independent of storage channel')
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
  // Execute the actual route with current permission grants, including revoked keys.
  let write = false, read = true, session = { user: actor }, validKey = true
  const route = compile('src/app/api/brands/[id]/folders/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getSession: async () => session, extractApiKey: r => r.headers.get('x-key'), getAgentFromApiKey: async () => validKey ? actor : null },
    '@/lib/asset-analysis/db': { prisma: db }, '@/lib/brandAccess': { canSessionAccessBrandProject: async () => read, canSessionWriteBrandProject: async () => write },
    '@/lib/asset-analysis/folders': folders, '@/lib/asset-library/folder-management': management,
  })
  const params = { params: Promise.resolve({ id: 'brand' }) }
  assert.equal((await route.POST(new Request('https://fixture', { method: 'POST', body: '{}' }), params)).status, 403)
  read = false; assert.equal((await route.GET(new Request('https://fixture'), params)).status, 404)
  read = true; session = null; validKey = false
  assert.equal((await route.GET(new Request('https://fixture', { headers: { 'x-key': 'revoked' } }), params)).status, 401)
  assert((await db.auditLog.count()) > 5)
  await pg.close()
  console.log('PASS material folders: additive migration, real SQL tree/filing transactions, revision races, rename seeding, permissions, brand isolation, AI protection and reference identity')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
