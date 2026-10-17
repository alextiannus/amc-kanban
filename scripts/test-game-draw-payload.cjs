const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the production serializer without importing the React dashboard or browser APIs.
const source = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/ActivitySettingsEditor.tsx'), 'utf8')
const ast = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const helper = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'editableDrawConfig')
assert.ok(helper, 'Draw save serializer must exist')
const javascript = ts.transpileModule(helper.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
const serialize = vm.runInNewContext(javascript + '; editableDrawConfig')
const config = {
  id: 'game-1', title: 'Draw', description: 'Welcome', themeColor: '#123456',
  taskGoogleMapsEnabled: true, taskXiaohongshuEnabled: false, taskInstagramEnabled: true,
  clerkPin: '123456', maxSpinsPerUserDay: 3, templateType: 'WHEEL',
  brand: { googlePlaceId: 'place-old', accounts: [{ profileUrl: 'https://www.instagram.com/old/' }] },
  googleReviewUrl: 'https://example.com/old',
  prizes: [{ id: 'prize-1', name: 'Drink', type: 'PHYSICAL', probability: 1,
    totalInventory: 20, imageUrl: 'https://example.com/drink.png', claimedCount: 4, gameConfigId: 'game-1' }],
}
const before = JSON.stringify(config)
const payload = JSON.parse(JSON.stringify(serialize(config)))
assert.equal(payload.prizes[0].imageUrl, config.prizes[0].imageUrl, 'Saving unrelated draw settings must preserve existing prize artwork')
assert.equal(payload.prizes[0].id, 'prize-1', 'Preserve prize identity')
assert.equal(payload.prizes[0].totalInventory, 20)
for (const key of ['brand', 'id', 'googlePlaceId', 'googleReviewUrl', 'googleBusinessUrl', 'accounts']) {
  assert.equal(Object.hasOwn(payload, key), false, key + ' must stay out of draw saves')
}
assert.equal(Object.hasOwn(payload.prizes[0], 'claimedCount'), false, 'Do not submit server-owned reward counts')
assert.equal(Object.hasOwn(payload.prizes[0], 'gameConfigId'), false)
assert.equal(JSON.stringify(config), before, 'Serializer must not mutate loaded data')
config.brand = { googlePlaceId: 'place-new', accounts: [{ profileUrl: 'https://www.instagram.com/new/' }] }
assert.equal(JSON.stringify(serialize(config)), JSON.stringify(payload), 'Account sync must neither alter draw saves nor mark gameplay dirty')
config.title = 'New title'
assert.notEqual(JSON.stringify(serialize(config)), JSON.stringify(payload), 'Edited game rules must still be detected')
config.prizes[0].imageUrl = null
assert.equal(serialize(config).prizes[0].imageUrl, null, 'Preserve explicit empty artwork')
console.log('PASS draw save preserves prize artwork and identity, excludes synced account data, and ignores server-only changes.')
