const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

let selected
let configured = false
let privateRead = false
const brandFixture = { postfastApiKey: 'TEST_PRIVATE_KEY', followRewardDescription: null, name: 'TEST Brand', googlePlaceId: 'ChIJ_TEST_CONFIGURED', accounts: [], knowledge: null, googleLinksMeta: {} }
const failWrite = () => assert.fail('Public follow entry must not create games or schedule writes')
const activityModule = { exports: {} }
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/activityPage.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(activityModule, activityModule.exports)
const dependencies = {
  '@/lib/activityPage': activityModule.exports,
  '@/lib/brandFollowAccounts': { resolveBrandFollowAccounts: async accounts => accounts.map(({platformId,handle,profileUrl})=>({platformId,handle,profileUrl})) },
  '@/lib/followReward': { followRewardDescription: value => value ?? '关注账号，可获赠饮品一份' },
  'next/server': { NextResponse: { json: Response.json }, after: failWrite },
  '@/lib/auth': { getSession: () => privateRead ? { user: { id: 'TEST_owner', role: 'USER' } } : assert.fail('Public entry must not require a merchant session') },
  '@/lib/brandAccess': { canHumanAccessBrandProject: async () => true },
  '@/lib/gamePrizes': {},
  '@/lib/gameShareDraftPool': {},
  '@/lib/brandEntryTheme': { configuredBrandColor: () => null, safeBrandColor: value => value },
  '@/lib/prisma': { prisma: {
    gameConfig: { findUnique: async () => configured ? { id: 'TEST_config', themeColor: '#334155', clerkPin: 'TEST_PIN', brand: brandFixture, prizes: [] } : null, create: failWrite },
    gameActivityRound: { findFirst: async () => null },
    brand: { findUnique: async ({ select }) => {
      selected = select
      return brandFixture
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
  assert.equal(data.brand.followRewardDescription, '关注账号，可获赠饮品一份')
  assert.equal(JSON.stringify(data).includes('TEST_PRIVATE_KEY'), false)
  assert.equal(data.brand.postfastApiKey, undefined)
  configured = true
  const configuredResponse = await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))
  const configuredData = await configuredResponse.json()
  assert.equal(configuredResponse.status, 200)
  assert.equal(configuredData.brand.followRewardDescription, '关注账号，可获赠饮品一份')
  assert.equal(JSON.stringify(configuredData).includes('TEST_PRIVATE_KEY'), false)
  assert.equal(JSON.stringify(configuredData).includes('TEST_PIN'), false)
  assert.equal(configuredData.brand.postfastApiKey, undefined)
  brandFixture.activityPage = { text: {}, links: {}, drawEnabled: true }
  assert.equal((await (await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))).json()).hasActivity, true)
  brandFixture.activityPage.drawEnabled = false
  assert.equal((await (await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))).json()).hasActivity, false)
  configured = false
  privateRead = true
  const privateFollow = await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&initialize=false'))
  assert.equal(privateFollow.status, 200)
  assert.equal((await privateFollow.json()).hasActivity, false)
  console.log('PASS public configured and follow-only entry retains configured Place ID without creating a game or requiring authentication.')
})().catch(error => { console.error(error); process.exitCode = 1 })
