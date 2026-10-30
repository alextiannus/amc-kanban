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
const linksModule = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/brandFollowLinks.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => activityModule.exports, linksModule, linksModule.exports)
const storesModule = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/activityStores.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => linksModule.exports, storesModule, storesModule.exports)
const dependencies = {
  '@/lib/activityStores': storesModule.exports,
  '@/lib/brandFollowLinks': linksModule.exports,
  '@/lib/activityPageTranslation': {translateActivityPage: async page => activityModule.exports.normalizeActivityPage(page)},
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
  brandFixture.googlePlaceId = null
  brandFixture.address = '22 TEST Street'
  brandFixture.location = 'Singapore'
  brandFixture.knowledge = { stores: [{storeId:'west',name:'TEST West',address:'33 West Street',googleBusiness:{placeId:'ChIJ_WEST'}}] }
  for (const hasConfig of [false,true]) {
    configured = hasConfig
    const result = await (await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))).json()
    assert.equal(result.brand.googleMapEntries[0].kind,'place')
    assert.equal(new URL(result.brand.googleMapEntries[0].url).searchParams.get('query_place_id'),'ChIJ_WEST')
    assert.equal(result.brand.knowledge,undefined)
    brandFixture.knowledge = null
    const fallback = await (await moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'))).json()
    assert.equal(fallback.brand.googleMapEntries[0].kind,'search')
    assert.equal(new URL(fallback.brand.googleMapEntries[0].url).searchParams.get('query'),'TEST Brand 22 TEST Street Singapore')
    brandFixture.knowledge = { stores: [{storeId:'west',name:'TEST West',address:'33 West Street',googleBusiness:{placeId:'ChIJ_WEST'}}] }
  }
  brandFixture.knowledge = { stores: [{storeId:'north',name:'North',address:'North Road',isPrimary:true},{storeId:'south',name:'South',address:'South Road'}] }
  brandFixture.googleBusinessUrl='https://maps.google.com/?cid=north'
  for (const hasConfig of [false,true]) {
    configured=hasConfig
    const read=async store=>moduleUnderTest.exports.GET(new Request('https://example.test/api/game/config?brandId=TEST&public=true'+(store?'&store='+store:'')))
    assert.equal((await (await read()).json()).brand.storeSelectionRequired,true)
    const south=await (await read('south')).json()
    assert.equal(south.brand.activityStoreId,'south')
    assert.equal(south.brand.googleMapEntries.length,1)
    assert.match(south.brand.googleMapEntries[0].url,/South/)
    assert.doesNotMatch(south.brand.googleMapEntries[0].url,/north/)
    assert.equal((await read('missing')).status,404)
  }
  console.log('PASS public configured and follow-only entry retains configured Place ID without creating a game or requiring authentication.')
})().catch(error => { console.error(error); process.exitCode = 1 })
