import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'

// Executes real PostgreSQL constraints, row locks and transactional rollback.
// The small Prisma adapter covers only operations used by placeholder handling.
export async function placeholderTestDb() {
  const pg = new PGlite()
  await pg.exec(`
    CREATE TABLE "SocialAccount" (id text PRIMARY KEY, "brandId" text, "platformId" text, handle text, row jsonb NOT NULL,
      UNIQUE("brandId","platformId",handle));
    CREATE TABLE "ContentDraft" (id text PRIMARY KEY, "brandId" text, "accountId" text REFERENCES "SocialAccount"(id), row jsonb NOT NULL);
    CREATE TABLE "ActionItem" (id text PRIMARY KEY, "accountId" text REFERENCES "SocialAccount"(id), "draftId" text REFERENCES "ContentDraft"(id), row jsonb NOT NULL);
    CREATE TABLE "SocialAccountSnapshot" (id text PRIMARY KEY, "accountId" text REFERENCES "SocialAccount"(id), row jsonb NOT NULL);
    CREATE TABLE "PostfastInboxConversation" (id text PRIMARY KEY, "accountId" text REFERENCES "SocialAccount"(id), row jsonb NOT NULL);
    CREATE TABLE "GoogleBrandImport" (id text PRIMARY KEY, row jsonb NOT NULL);
    CREATE TABLE "PostfastDeliveryJob" (id text PRIMARY KEY, "draftId" text REFERENCES "ContentDraft"(id), row jsonb NOT NULL);
    CREATE TABLE "AuditLog" (id text PRIMARY KEY, row jsonb NOT NULL);
    CREATE TABLE "Brand" (id text PRIMARY KEY, row jsonb NOT NULL);
    CREATE SCHEMA amc_iaic;
    CREATE TABLE amc_iaic.autopilot_settings (brand_id text PRIMARY KEY, account_id text);
    CREATE TABLE amc_iaic.autopilot_runs (id text PRIMARY KEY, account_id text);
  `)
  const names: Record<string, string> = { socialAccount: 'SocialAccount', contentDraft: 'ContentDraft', actionItem: 'ActionItem', socialAccountSnapshot: 'SocialAccountSnapshot', postfastInboxConversation: 'PostfastInboxConversation', googleBrandImport: 'GoogleBrandImport', postfastDeliveryJob: 'PostfastDeliveryJob', auditLog: 'AuditLog', brand: 'Brand' }
  const cols: Record<string, string[]> = { SocialAccount: ['brandId', 'platformId', 'handle'], ContentDraft: ['brandId', 'accountId'], ActionItem: ['accountId', 'draftId'], SocialAccountSnapshot: ['accountId'], PostfastInboxConversation: ['accountId'], PostfastDeliveryJob: ['draftId'] }
  const defaults: Record<string, any> = {
    SocialAccount: { unboundAt: null, autoPilot: true, postfastAccountId: null, profileUrl: null, accessToken: null, refreshToken: null, loginUsername: null, loginPassword: null, connectionStatus: 'UNKNOWN', disabledReason: null },
    ContentDraft: { status: 'draft', scheduledAt: null, publishedAt: null, platformPostId: null, postUrl: null },
  }
  let beforeDraftUpdate: ((tx: any) => Promise<void>) | null = null
  let failAudit = false
  function adapter(sql: any): any {
    const quote = (name: string) => '"' + name + '"'
    function where(table: string, filter: any, args: any[], alias = 'a'): string {
      const arg = (value: any) => { args.push(typeof value === 'string' ? value : String(value)); return '$' + args.length }
      return Object.entries(filter || {}).map(([key, value]: [string, any]) => {
        if (key === 'NOT') return `NOT (${where(table, value, args, alias)})`
        if (key === 'OR' || key === 'AND') return '(' + value.map((v: any) => where(table, v, args, alias)).join(` ${key} `) + ')'
        if (key === 'brandId_platformId_handle') return where(table, value, args, alias)
        const relations: Record<string, [string, string, string]> = {
          drafts: ['ContentDraft', 'accountId', 'none'], actionItems: ['ActionItem', 'accountId', 'none'], snapshots: ['SocialAccountSnapshot', 'accountId', 'none'], inboxConversations: ['PostfastInboxConversation', 'accountId', 'none'], postfastDeliveryJobs: ['PostfastDeliveryJob', 'draftId', 'none'], actionItem: ['ActionItem', 'draftId', 'is'],
        }
        if (relations[key]) {
          const [child, column] = relations[key]
          return `NOT EXISTS (SELECT 1 FROM ${quote(child)} r WHERE r.${quote(column)}=${alias}.id)`
        }
        const expression = `${alias}.row->>'${key}'`
        if (value === null) return `${expression} IS NULL`
        if (value && typeof value === 'object') {
          if ('in' in value) return `${expression} IN (${value.in.map(arg).join(',')})`
          if ('not' in value) return value.not === null ? `${expression} IS NOT NULL` : `${expression} <> ${arg(value.not)}`
          if ('path' in value) return `${alias}.row->'${key}'#>>'{${value.path.join(',')}}'=${arg(value.equals)}`
          throw new Error('Unsupported test condition: ' + key)
        }
        return `${expression}=${arg(value)}`
      }).join(' AND ') || 'true'
    }
    const db: any = {}
    for (const [name, table] of Object.entries(names)) {
      const find = async ({ where: filter = {}, orderBy }: any = {}) => {
        const args: any[] = []
        const query = `SELECT row FROM ${quote(table)} a WHERE ${where(table, filter, args)} ${orderBy ? 'ORDER BY id' : ''}`
        return (await sql.query(query, args)).rows.map((r: any) => r.row)
      }
      const create = async ({ data }: any) => {
        const row = { id: randomUUID(), ...defaults[table], ...data }
        const columns = ['id', ...(cols[table] || []), 'row']
        const args = columns.map(c => c === 'row' ? JSON.stringify(row) : row[c] ?? null)
        await sql.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)
        return row
      }
      const updateMany = async ({ where: filter, data }: any) => {
        if (table === 'ContentDraft' && beforeDraftUpdate) { const work = beforeDraftUpdate; beforeDraftUpdate = null; await work(db) }
        const patch = { ...data, updatedAt: new Date().toISOString() }
        const args: any[] = [JSON.stringify(patch)]
        const updates = ['row=row||$1::jsonb']
        for (const column of cols[table] || []) if (column in data) { args.push(data[column]); updates.push(`${quote(column)}=$${args.length}`) }
        const query = `UPDATE ${quote(table)} a SET ${updates.join(',')} WHERE ${where(table, filter, args)} RETURNING id`
        return { count: (await sql.query(query, args)).rows.length }
      }
      db[name] = {
        findMany: find, findFirst: async (args: any) => (await find(args))[0] || null, findUnique: async (args: any) => (await find(args))[0] || null,
        findUniqueOrThrow: async (args: any) => { const row = (await find(args))[0]; if (!row) throw new Error('Missing record'); return row },
        count: async (args: any) => (await find(args)).length,
        create: async (args: any) => { if (table === 'AuditLog' && failAudit) throw new Error('injected audit failure'); return create(args) },
        updateMany,
        update: async (args: any) => { const changed = await updateMany(args); if (changed.count !== 1) throw new Error('Expected one updated row'); return (await find({ where: args.where }))[0] },
        upsert: async ({ where: filter, create: data, update }: any) => { const existing = (await find({ where: filter }))[0]; if (existing) { await updateMany({ where: { id: existing.id }, data: update }); return (await find({ where: { id: existing.id } }))[0] }; return create({ data }) },
        deleteMany: async ({ where: filter }: any) => { const args: any[] = []; return { count: (await sql.query(`DELETE FROM ${quote(table)} a WHERE ${where(table, filter, args)} RETURNING id`, args)).rows.length } },
      }
    }
    db.$queryRaw = async (strings: TemplateStringsArray, ...values: any[]) => (await sql.query(strings.reduce((s, part, i) => s + part + (i < values.length ? '$' + (i + 1) : ''), ''), values)).rows
    db.$executeRaw = async (strings: TemplateStringsArray, ...values: any[]) => (await sql.query(strings.reduce((s, part, i) => s + part + (i < values.length ? '$' + (i + 1) : ''), ''), values)).affectedRows
    db.$extends = () => db
    return db
  }
  const db = adapter(pg)
  db.$transaction = (work: any) => pg.transaction(async tx => work(adapter(tx)))
  return {
    db, pg,
    failAudit: (value: boolean) => { failAudit = value },
    beforeDraftUpdate: (work: (tx: any) => Promise<void>) => { beforeDraftUpdate = work },
    reset: async () => { await pg.exec('TRUNCATE "ActionItem", "SocialAccountSnapshot", "PostfastInboxConversation", "GoogleBrandImport", "PostfastDeliveryJob", "ContentDraft", "SocialAccount", "AuditLog", "Brand", amc_iaic.autopilot_settings, amc_iaic.autopilot_runs CASCADE'); failAudit = false; beforeDraftUpdate = null },
  }
}
