import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [client, configRoute, rewardRoute, modulePrd] = await Promise.all([
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/config/route.ts`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/entry-reward/route.ts`, 'utf8'),
  readFile(`${repoRoot}/docs/prd-aivue.md`, 'utf8'),
])

assert.match(client, /amc-game-session:\$\{brandId\}/, 'anonymous session identity remains brand-scoped in localStorage')
assert.match(client, /navigator\.clipboard\?\.writeText/)
assert.match(client, /if \(!copied\)[\s\S]*?return/, 'copy failures must stop before reward and navigation')
assert.match(client, /fetch\('\/api\/game\/entry-reward'/)
assert.match(client, /body: JSON\.stringify\(\{ brandId, sessionId, platform \}\)/)
assert.match(client, /!truthConfirmed \|\| Boolean\(rewardingPlatform\)/)
assert.match(client, /activityActive && !status\?\.entryRewardClaimed/)
assert.match(client, /showGame && config/)
assert.doesNotMatch(client, /Optional public sharing|optionalSharing/)

const copyIndex = client.indexOf('await navigator.clipboard.writeText(text)')
const rewardIndex = client.indexOf("fetch('/api/game/entry-reward'")
const openIndex = client.indexOf('openPlatform(platform)', rewardIndex)
assert.ok(copyIndex >= 0 && rewardIndex > copyIndex && openIndex > rewardIndex, 'copy, reward, and navigation must occur in that order')

assert.doesNotMatch(client, /comgooglemaps:\/\//)
assert.match(client, /comgooglemapsurl:\/\//)
assert.match(client, /googleReviewAppUrl/)
assert.match(client, /xhsdiscover:\/\//)
assert.match(client, /instagram:\/\//)
assert.match(client, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 900\)/)
assert.match(configRoute, /googleReviewAppUrlFromMeta/)
assert.match(rewardRoute, /platformEnabled/)
assert.doesNotMatch(rewardRoute, /review|published|screenshot/i)
assert.match(modulePrd, /copying succeeds.*reward endpoint.*platform/s)

console.log('Customer game copy-reward-open action contract passed.')
