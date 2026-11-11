import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { calendarNotesHandlers } from '../src/lib/calendarNotesHttp.ts'
import { validCalendarDate, validCalendarMonth, type CalendarNote, type CalendarNoteDatabase } from '../src/lib/calendarNotes.ts'

// Serialize transactions like a row-locked database; test the real handlers,
// validation and service without production credentials or database writes.
const records = new Map<string, CalendarNote>()
let sequence = 0, writes = 0, transactions: Promise<unknown> = Promise.resolve()
const copy = <T>(value: T): T => structuredClone(value)
const repository: CalendarNoteDatabase['calendarNote'] = {
  async findMany({ where }) { return copy([...records.values()].filter(row => row.brandId === where.brandId && row.date.startsWith(where.date.startsWith)).sort((a, b) => a.date.localeCompare(b.date))) },
  async create({ data }) {
    const key = `${data.brandId}:${data.date}`
    if (records.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    const note = { ...data, id: `note-${++sequence}`, version: 1, createdAt: new Date(), updatedAt: new Date() }
    records.set(key, note); writes++
    return copy(note)
  },
  async updateMany({ where, data }) {
    const note = records.get(`${where.brandId}:${where.date}`)
    if (!note || note.version !== where.version) return { count: 0 }
    records.set(`${where.brandId}:${where.date}`, { ...note, ...(data.title !== undefined ? { title: data.title } : {}), ...(data.color !== undefined ? { color: data.color } : {}), body: data.body, updatedBy: data.updatedBy, version: note.version + data.version.increment, updatedAt: new Date() })
    writes++; return { count: 1 }
  },
  async findUniqueOrThrow({ where }) { const note = records.get(`${where.brandId_date.brandId}:${where.brandId_date.date}`); assert(note); return copy(note) },
}
const db: CalendarNoteDatabase = {
  calendarNote: repository,
  $transaction(fn) { const result = transactions.then(() => fn({ calendarNote: repository })); transactions = result.catch(() => undefined); return result },
}
let actor: { id: string; type: string } | null = { id: 'writer', type: 'HUMAN' }
const handlers = calendarNotesHandlers({
  db, authenticate: async () => actor ? { user: actor } : null,
  canRead: async brand => brand === 'brand-a' && !!actor,
  canWrite: async brand => brand === 'brand-a' && actor?.id === 'writer',
})
const put = (date: string, body: unknown, expectedVersion: unknown, brand = 'brand-a', title?: unknown, color?: unknown) => handlers.PUT(new Request('http://local/api', { method: 'PUT', body: JSON.stringify({ body, expectedVersion, ...(title !== undefined ? { title } : {}), ...(color !== undefined ? { color } : {}), updatedBy: 'forged' }) }), brand, date)
const get = (month = '2026-12', brand = 'brand-a') => handlers.GET(new Request(`http://local/api?month=${month}`), brand)

for (const date of ['2026-12-31', '2027-01-01', '2028-02-29', '2000-02-29', '0001-01-01']) assert(validCalendarDate(date), date)
for (const date of ['2026-02-29', '1900-02-29', '0000-01-01', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-1', '2026-11-01T00:00:00Z']) assert(!validCalendarDate(date), date)
assert(validCalendarMonth('9999-12')); assert(!validCalendarMonth('2026-13')); assert(!validCalendarMonth('0000-01'))

actor = null
assert.equal((await get()).status, 401); assert.equal((await put('2026-12-01', 'x', null)).status, 401)
actor = { id: 'reader', type: 'HUMAN' }
assert.equal((await get()).status, 200); assert.equal((await (await get()).json()).canEdit, false)
assert.equal((await put('2026-12-01', 'x', null)).status, 404)
actor = { id: 'writer', type: 'HUMAN' }
assert.equal((await get('2026-12', 'brand-b')).status, 404)
assert.equal((await put('2026-12-01', 'x', null, 'brand-b')).status, 404)
assert.equal((await get('2026-13')).status, 400)
assert.equal((await get('0000-01')).status, 400)
for (const [date, body, version] of [['2026-02-29', 'x', null], ['2026-12-01', null, null], ['2026-12-01', 'x', 0], ['2026-12-01', 'x', -1], ['2026-12-01', 'x', '1'], ['2026-12-01', 'x', 1.5], ['2026-12-01', 'x'.repeat(2001), null], ['2026-12-01', '\u0000', null]] as const) {
  assert.equal((await put(date, body, version)).status, 400)
}
assert.equal(writes, 0)
assert.equal((await handlers.PUT(new Request('http://local', { method: 'PUT', body: '{invalid' }), 'brand-a', '2026-12-01')).status, 400)
assert.equal((await handlers.PUT(new Request('http://local', { method: 'PUT', body: '{}' }), 'brand-a', '2026-12-01')).status, 400)

const original = '上午拍摄新品套餐\r\n  工作日午餐主题  '
const createdResponse = await put('2026-12-01', original, null)
assert.equal(createdResponse.status, 200)
assert.equal(createdResponse.headers.get('cache-control'), 'no-store')
const created = (await createdResponse.json()).note
assert.equal(created.body, original.replace('\r\n', '\n')); assert.equal(created.version, 1)
assert.equal(created.color, 'yellow', 'legacy creates use yellow')
assert.equal(created.createdBy, 'writer'); assert.equal(created.updatedBy, 'writer')
assert.equal((await put('2026-12-01', 'duplicate', null)).status, 409)
const race = await Promise.all([put('2026-12-01', 'winner-a', 1), put('2026-12-01', 'winner-b', 1)])
assert.deepEqual(race.map(r => r.status).sort(), [200, 409])
const winner = (await race.find(r => r.status === 200)!.json()).note
assert.equal(winner.version, 2)
assert.equal((await put('2026-12-01', 'stale', 1)).status, 409)
const cleared = (await (await put('2026-12-01', ' \n\t ', 2)).json()).note
assert.equal(cleared.body, ''); assert.equal(cleared.version, 3)
assert.equal((await put('2026-12-01', 'recreate after clear', null)).status, 409)
assert.equal((await put('2026-12-01', 'stale after clear', 2)).status, 409)
assert.equal((await put('2026-12-01', '🎥'.repeat(2000), 3)).status, 200)
assert.equal((await put('2026-12-01', '🎥'.repeat(2001), 4)).status, 400)
const creationRace = await Promise.all([put('2026-12-02', 'first', null), put('2026-12-02', 'second', null)])
assert.deepEqual(creationRace.map(r => r.status).sort(), [200, 409])
assert.equal((await put('2027-01-01', 'new year', null)).status, 200)
const december = await (await get()).json()
assert.equal(december.canEdit, true); assert.deepEqual(december.notes.map((n: CalendarNote) => n.date), ['2026-12-01', '2026-12-02'])
actor = { id: 'reader', type: 'HUMAN' }
assert.equal((await (await get()).json()).notes[0].body, '🎥'.repeat(2000), 'shared notes survive a different authorized actor')
assert.equal((await (await get('2027-01')).json()).notes[0].body, 'new year')
assert.deepEqual((await (await get('2028-02')).json()).notes, [])
actor = { id: 'writer', type: 'HUMAN' }
assert.equal((await put('2026-12-05', 'shoot lunch', null, 'brand-a', '🎥'.repeat(41))).status, 400)
assert.equal((await put('2026-12-05', 'shoot lunch', null, 'brand-a', 'bad\ntitle')).status, 400)
for(const separator of ['\u0085','\u2028','\u2029'])assert.equal((await put('2026-12-05', 'shoot lunch', null, 'brand-a', `bad${separator}title`)).status, 400)
assert.equal((await put('2026-12-05', '', null, 'brand-a', 'Title without body')).status, 400)
let titled = (await (await put('2026-12-05', 'shoot lunch', null, 'brand-a', '🎥'.repeat(40))).json()).note
assert.equal(titled.title, '🎥'.repeat(40))
titled = (await (await put('2026-12-05', 'legacy body update', 1)).json()).note
assert.equal(titled.title, '🎥'.repeat(40), 'legacy body-only updates preserve titles')
const titleRace = await Promise.all([put('2026-12-05', 'body A', 2, 'brand-a', 'title A'), put('2026-12-05', 'body B', 2, 'brand-a', 'title B')])
assert.deepEqual(titleRace.map(r => r.status).sort(), [200, 409])
titled = (await titleRace.find(r => r.status === 200)!.json()).note
assert.equal(titled.title.slice(-1), titled.body.slice(-1), 'title and body are atomic')
titled = (await (await put('2026-12-05', 'legacy clear', 3, 'brand-a', '')).json()).note
assert.equal(titled.title, '', 'new clients may explicitly remove a title')
titled = (await (await put('2026-12-05', 'with heading', 4, 'brand-a', 'Heading')).json()).note
titled = (await (await put('2026-12-05', '', 5)).json()).note
assert.equal(titled.title, ''); assert.equal(titled.body, ''); assert.equal(titled.version, 6)
// Color-only saves use the same version as text, including legacy updates and clears.
let colored = (await (await put('2026-12-06', 'shared body', null, 'brand-a', 'Shared title', 'green')).json()).note
assert.equal(colored.color, 'green')
const invalidWrites = writes
for (const color of ['blue', '', 'GREEN', null, 1, {}, ['green']]) {
  const response = await put('2026-12-06', 'shared body', 1, 'brand-a', 'Shared title', color)
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, 'invalid_calendar_note_color')
}
assert.equal(writes, invalidWrites)
colored = (await (await put('2026-12-06', 'legacy text edit', 1)).json()).note
assert.equal(colored.color, 'green', 'legacy updates preserve green')
colored = (await (await put('2026-12-06', colored.body, 2, 'brand-a', colored.title, 'yellow')).json()).note
assert.equal(colored.color, 'yellow'); assert.equal(colored.version, 3)
assert.equal(colored.body, 'legacy text edit'); assert.equal(colored.title, 'Shared title')
const colorRace = await Promise.all([
  put('2026-12-06', colored.body, 3, 'brand-a', colored.title, 'green'),
  put('2026-12-06', 'concurrent text', 3, 'brand-a', 'Concurrent title', 'yellow'),
])
assert.deepEqual(colorRace.map(r => r.status).sort(), [200, 409])
const colorWinner = (await colorRace.find(r => r.status === 200)!.json()).note
assert.deepEqual(
  { title: colorWinner.title, body: colorWinner.body, color: colorWinner.color },
  colorWinner.color === 'green' ? { title: colored.title, body: colored.body, color: 'green' } : { title: 'Concurrent title', body: 'concurrent text', color: 'yellow' },
  'concurrent color and text changes cannot produce a mixed note',
)
actor = { id: 'reader', type: 'HUMAN' }
assert.equal((await (await get()).json()).notes.find((n: CalendarNote) => n.date === colored.date).color, colorWinner.color)
assert.equal((await put(colored.date, colored.body, 4, 'brand-a', colored.title, 'green')).status, 404)
actor = { id: 'writer', type: 'HUMAN' }
colored = (await (await put(colored.date, colored.body, 4, 'brand-a', colored.title, 'green')).json()).note
colored = (await (await put(colored.date, '', 5)).json()).note
assert.equal(colored.color, 'yellow', 'legacy clear resets the color')
colored = (await (await put(colored.date, 'new plan', 6)).json()).note
assert.equal(colored.color, 'yellow', 'refilling a cleared note starts yellow')

// Execute the real migrations against isolated PostgreSQL; never use production credentials.
const pg = new PGlite()
try {
  await pg.exec('CREATE TABLE "Brand" ("id" TEXT PRIMARY KEY); INSERT INTO "Brand" VALUES (\'brand-a\');')
  await pg.exec(readFileSync('prisma/migrations/20261103090000_calendar_notes/migration.sql', 'utf8'))
  await pg.exec(readFileSync('prisma/migrations/20261103100000_calendar_note_titles/migration.sql', 'utf8'))
  await pg.exec(`INSERT INTO "CalendarNote" ("id","brandId","date","title","body","version","createdBy","updatedBy","updatedAt") VALUES ('old','brand-a','2026-12-01','Old title','Old body',7,'writer','writer',CURRENT_TIMESTAMP)`)
  const before = (await pg.query('SELECT * FROM "CalendarNote"')).rows[0]
  await pg.exec(readFileSync('prisma/migrations/20261111100000_calendar_note_colors/migration.sql', 'utf8'))
  const after = (await pg.query('SELECT * FROM "CalendarNote"')).rows[0] as Record<string, unknown>
  const { color, ...unchanged } = after
  assert.equal(color, 'yellow'); assert.deepEqual(unchanged, before, 'migration preserves every old field')
  await pg.exec(`UPDATE "CalendarNote" SET "color"='green' WHERE "id"='old'`)
  assert.equal((await pg.query<{ color: string }>('SELECT "color" FROM "CalendarNote"')).rows[0].color, 'green')
  await assert.rejects(pg.exec(`UPDATE "CalendarNote" SET "color"='blue' WHERE "id"='old'`))
} finally { await pg.close() }
console.log('PASS note colors: default, legacy compatibility, validation, shared permissions, conflicts, clear and real PostgreSQL migration preservation')
console.log('PASS calendar note dates, Unicode limits, ACL, shared reads, month isolation, concurrent creates/updates and clear versions (isolated repository)')
