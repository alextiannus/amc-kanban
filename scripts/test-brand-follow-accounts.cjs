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
const links = compile('src/lib/brandFollowLinks.ts')
const identities = compile('src/lib/socialAccountIdentity.ts')
let accountReads = 0, postReads = 0
const remotes = [
  { id: 'ig-a', platformId: 'instagram', handle: 'actual_a', profileUrl: 'https://www.instagram.com/actual_a/' },
  { id: 'fb-a', platformId: 'facebook', handle: 'TEST Page A' },
  { id: 'ig-b', platformId: 'instagram', handle: 'actual_b', profileUrl: 'https://www.instagram.com/actual_b/' },
]
const provider = {
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
  console.log('PASS automatic bound account resolution: multi-brand isolation, provider identity, Facebook post evidence, new-binding cache refresh, concurrent request dedupe, unbound filtering, provider failure and no guessed links.')
})().catch(error => { console.error(error); process.exitCode = 1 })
