const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

let selected
const failWrite = () => assert.fail('Public follow entry must not create games or schedule writes')
const dependencies = {
  'next/server': { NextResponse: { json: Response.json }, after: failWrite },
  '@/lib/auth': { getSession: () => assert.fail('Public entry must not require a merchant session') },
  '@/lib/brandAccess': {},
  '@/lib/gamePrizes': {},
  '@/lib/gameShareDraftPool': {},
  '@/lib/brandEntryTheme': { configuredBrandColor: () => null },
  '@/lib/prisma': { prisma: {
    gameConfig: { findUnique: async () => null, create: failWrite },
    brand: { findUnique: async ({ select }) => {
      selected = select
      return { name: 'TEST Brand', googlePlaceId: 'ChIJ_TEST_CONFIGURED', accounts: [], knowledge: null }
    } },
  } },
}
const source = fs.readFileSync(path.resolve(__dirname, '../src/app/api/game/config/route.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUnderTest = { exports: {} }
new Function('require', 'module', 'exports', compiled)(name => {
  assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
  return dependencies[name]
}, moduleUnderTest, moduleUnderTest.exports)

;(async () => {
  const response = await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(selected.googlePlaceId, true)
  assert.equal(data.brand.googlePlaceId, 'ChIJ_TEST_CONFIGURED')
  assert.equal(data.hasActivity, false)
  assert.equal(data.clerkPin, undefined)
  console.log('PASS public follow-only entry retains configured Place ID without creating a game or requiring authentication.')
})().catch(error => { console.error(error); process.exitCode = 1 })
