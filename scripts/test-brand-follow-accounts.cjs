const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function compile(file, dependencies = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const links = compile('src/lib/brandFollowLinks.ts', { './activityPage': compile('src/lib/activityPage.ts') })
const identities = compile('src/lib/socialAccountIdentity.ts')
let accountReads = 0, postReads = 0
const remotes = [
  { id: 'ig-a', platformId: 'instagram', handle: 'actual_a', profileUrl: 'https://www.instagram.com/actual_a/' },
  { id: 'fb-a', platformId: 'facebook', handle: 'TEST Page A' },
  { id: 'ig-b', platformId: 'instagram', handle: 'actual_b', profileUrl: 'https://www.instagram.com/actual_b/' },
]
let googleLocations = []
const provider = {
  postfastGetGBPLocations: async (key, id) => ({ success: true, locations: id === 'google-a' ? googleLocations : [] }),
  postfastFetchAccounts: async key => { accountReads++; return { success: key !== 'TEST_FAIL', accounts: remotes } },
  postfastListPosts: async () => { postReads++; return { success: true, posts: [
    { socialMediaId: 'fb-a', platformId: 'facebook', status: 'published', postUrl: 'https://www.facebook.com/61500000000001/posts/123' },
    { socialMediaId: 'foreign-account', platformId: 'facebook', status: 'published', postUrl: 'https://www.facebook.com/61500000000002/posts/124' },
  ] } },
}
const { resolveBrandFollowAccounts, profileFromAccountPost } = compile('src/lib/brandFollowAccounts.ts', {
  'node:crypto': require('node:crypto'), './brandFollowLinks': links, './socialAccountIdentity': identities, './integrations/postfast': provider,
})
const account = (id, providerId, platformId, handle = 'OLD DISPLAY NAME') => ({ id, postfastAccountId: providerId, platformId, handle, profileUrl: null })
;(async () => {
  const localsA = [account('local-ig-a', 'ig-a', 'instagram'), account('local-fb-a', 'fb-a', 'facebook')]
  const results = await Promise.all(Array.from({length: 8}, () => resolveBrandFollowAccounts(localsA, 'TEST_SHARED_WORKSPACE')))
  assert.equal(accountReads, 1); assert.equal(postReads, 1)
  assert.equal(results[0][0].profileUrl, 'https://www.instagram.com/actual_a/')
  assert.equal(results[0][1].profileUrl, 'https://www.facebook.com/61500000000001')
  assert.equal(results[0][0].handle, 'actual_a')
  assert.deepEqual(Object.keys(results[0][0]).sort(), ['handle', 'platformId', 'profileUrl'])
  const brandB = await resolveBrandFollowAccounts([account('local-b', 'ig-b', 'instagram')], 'TEST_SHARED_WORKSPACE')
  assert.equal(brandB.length, 1); assert.equal(brandB[0].profileUrl, 'https://www.instagram.com/actual_b/')
  remotes.push({ id: 'ig-new', platformId: 'instagram', handle: 'new_binding', profileUrl: 'https://www.instagram.com/new_binding/' })
  const before = accountReads
  const newlyBound = await resolveBrandFollowAccounts([...localsA, account('local-new', 'ig-new', 'instagram')], 'TEST_SHARED_WORKSPACE')
  assert.equal(accountReads, before + 1, 'New binding must bypass the old account snapshot immediately')
  assert.equal(newlyBound[2].profileUrl, 'https://www.instagram.com/new_binding/')
  const unbound = await resolveBrandFollowAccounts([{...localsA[0],unboundAt:new Date()}], 'TEST_SHARED_WORKSPACE')
  assert.deepEqual(unbound, [])
  const wrongId = await resolveBrandFollowAccounts([account('wrong-local', 'missing-stable-id', 'instagram', 'actual_a')], 'TEST_SHARED_WORKSPACE')
  assert.equal(wrongId[0].profileUrl, null, 'Never replace a missing stable identity by handle')
  const recorded = { ...localsA[0], profileUrl: 'https://www.instagram.com/recorded/' }
  const failed = await resolveBrandFollowAccounts([recorded, localsA[1]], 'TEST_FAIL')
  assert.equal(failed[0].profileUrl, recorded.profileUrl); assert.equal(failed[1].profileUrl, null)
  const noKey = await resolveBrandFollowAccounts([localsA[0]])
  assert.equal(noKey[0].profileUrl, null, 'Display names alone are not profile evidence')
  const remote = { id: 'fb-a', platformId: 'facebook' }
  for (const post of [
    {socialMediaId:'foreign', platformId:'facebook', status:'published', postUrl:'https://www.facebook.com/61500000000002/posts/1'},
    {socialMediaId:'fb-a', platformId:'facebook', status:'draft', postUrl:'https://www.facebook.com/61500000000002/posts/1'},
    {socialMediaId:'fb-a', platformId:'facebook', status:'published', postUrl:'https://www.facebook.com.evil.test/61500000000002/posts/1'},
    {socialMediaId:'fb-a', platformId:'facebook', status:'published', postUrl:'https://www.facebook.com/reel/123'},
    {socialMediaId:'fb-a', platformId:'facebook', status:'published', postUrl:'https://www.facebook.com/groups/posts/123'},
  ]) assert.equal(profileFromAccountPost(remote, post), null)
  remotes.push({ id: 'google-a', platformId: 'google', handle: 'TEST Google Owner' })
  const google = [account('local-google', 'google-a', 'google')]
  googleLocations = [{ id: 'locations/one', name: 'TEST One', placeId: 'ChIJ_TEST_ONE' }]
  const sole = await resolveBrandFollowAccounts(google, 'TEST_GOOGLE_SOLE')
  assert.equal(new URL(sole[0].profileUrl).searchParams.get('query_place_id'), 'ChIJ_TEST_ONE')
  googleLocations = [{ id: 'locations/one', name: 'TEST One', mapsUri: 'https://maps.google.com/?cid=1' }, { id: 'two', name: 'TEST Two', mapsUri: 'https://maps.google.com/?cid=2' }]
  assert.equal((await resolveBrandFollowAccounts(google, 'TEST_GOOGLE_MULTIPLE'))[0].profileUrl, null, 'Multiple businesses require an explicit selection')
  assert.equal((await resolveBrandFollowAccounts(google, 'TEST_GOOGLE_MULTIPLE', 'two'))[0].profileUrl, 'https://maps.google.com/?cid=2')
  assert.equal((await resolveBrandFollowAccounts(google, 'TEST_GOOGLE_MULTIPLE', 'absent'))[0].profileUrl, null, 'Never replace a missing selected location')
  assert.equal((await resolveBrandFollowAccounts(google, 'TEST_GOOGLE_MULTIPLE', 'one'))[0].profileUrl, 'https://maps.google.com/?cid=1', 'Normalize Google location resource prefixes')
  googleLocations = [{ id: 'accounts/provider-account/locations/123456', name: 'TEST Full Resource', mapsUri: 'https://maps.google.com/?cid=123456' }]
  for (const selection of ['123456', 'locations/123456', 'accounts/provider-account/locations/123456']) {
    assert.equal((await resolveBrandFollowAccounts(google, 'TEST_FULL_RESOURCE', selection))[0].profileUrl, 'https://maps.google.com/?cid=123456', 'Full provider resource and configured location must identify the same business')
  }
  assert.equal((await resolveBrandFollowAccounts(google, 'TEST_FULL_RESOURCE', 'another-location'))[0].profileUrl, null)
  const originalNow = Date.now
  let testNow = originalNow()
  Date.now = () => testNow
  try {
    googleLocations = []
    assert.equal((await resolveBrandFollowAccounts(google, 'TEST_EMPTY_REFRESH'))[0].profileUrl, null)
    googleLocations = [{ id: 'new-location', name: 'TEST Synced', mapsUri: 'https://maps.google.com/?cid=987' }]
    testNow += 90_001
    assert.equal((await resolveBrandFollowAccounts(google, 'TEST_EMPTY_REFRESH'))[0].profileUrl, 'https://maps.google.com/?cid=987', 'Empty location snapshots must refresh promptly after upstream sync')
  } finally { Date.now = originalNow }
  console.log('PASS automatic bound account resolution: multi-brand isolation, provider identity, Facebook post evidence, new-binding cache refresh, concurrent request dedupe, unbound filtering, provider failure and no guessed links.')
})().catch(error => { console.error(error); process.exitCode = 1 })
