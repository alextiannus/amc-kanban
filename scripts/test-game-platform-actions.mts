import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const [customerGameClient, gameSettingsDashboard, gameConfigRoute, modulePrd] = await Promise.all([
  readFile(`${repoRoot}/src/app/game/[brandId]/CustomerGameClient.tsx`, 'utf8'),
  readFile(`${repoRoot}/src/components/dashboard/GameSettingsDashboard.tsx`, 'utf8'),
  readFile(`${repoRoot}/src/app/api/game/config/route.ts`, 'utf8'),
  readFile(`${repoRoot}/docs/prd-aivue.md`, 'utf8'),
])

assert.match(customerGameClient, /useState<Platform \| null>\(null\)/, 'no sharing platform is selected by default')
assert.match(
  customerGameClient,
  /amc-game-opened-platform:\$\{brandId\}/,
  'opened-platform state must be scoped by brandId',
)
assert.match(customerGameClient, /window\.sessionStorage\.getItem\(storageKey\)/)
assert.match(customerGameClient, /window\.sessionStorage\.setItem\(openedPlatformStorageKey\(brandId\), platform\)/)
assert.match(
  customerGameClient,
  /isPlatform\(storedPlatform\) && activePlatforms\.includes\(storedPlatform\)/,
  'only enabled stored platforms may be restored',
)

assert.match(customerGameClient, /min-h-\[56px\] w-full/)
assert.match(customerGameClient, /aria-pressed=\{isOpened\}/)
assert.match(customerGameClient, /focus-visible:ring-2/)
assert.match(customerGameClient, /active:scale-\[0\.99\]/)
assert.doesNotMatch(
  customerGameClient,
  /mt-3 grid grid-cols-3 gap-2/,
  'social platform actions must not regress to horizontal tabs',
)

assert.match(customerGameClient, /taskType', 'EXPERIENCE_FEEDBACK'/)
assert.match(customerGameClient, /disabled=\{submittingTask \|\| !experienceIsValid \|\| Boolean\(pendingSubmission\)\}/)
assert.doesNotMatch(customerGameClient, /form\.set\('reviewPlatform'/)
assert.match(customerGameClient, /copyAndOpenPlatform/)
assert.match(customerGameClient, /navigator\.clipboard\?\.writeText/)
assert.match(customerGameClient, /if \(!copied\)[\s\S]*?return/, 'copy failures must stop before opening the platform')
assert.match(customerGameClient, /<CheckCircle2/)
assert.match(customerGameClient, /<ExternalLink/)

assert.doesNotMatch(
  customerGameClient,
  /comgooglemaps:\/\//,
  'Google review URLs must not be converted into Google Maps text-search queries',
)
assert.match(customerGameClient, /if \(!target\.appUrl\) \{[\s\S]*?window\.location\.assign\(target\.webUrl\)[\s\S]*?return/)
assert.match(customerGameClient, /comgooglemapsurl:\/\//, 'iOS must pass the original Google Maps review URL to the app')
assert.match(customerGameClient, /googleReviewAppUrl/, 'the customer game must consume the provider review action URL')
assert.match(customerGameClient, /xhsdiscover:\/\//)
assert.match(customerGameClient, /instagram:\/\//)
assert.match(customerGameClient, /window\.setTimeout\(\(\) => \{[\s\S]*?\}, 900\)/)
assert.match(gameSettingsDashboard, /Google Maps App 写评 URL/)
assert.match(gameSettingsDashboard, /googleReviewAppUrl: googleReviewAppUrl\.trim\(\)/)
assert.match(gameConfigRoute, /googleReviewAppUrlFromMeta/)
assert.match(gameConfigRoute, /googleLinksMeta: undefined|const \{ googleLinksMeta, \.\.\.brand \}/, 'public game config must not expose complete Google metadata')

assert.match(modulePrd, /Public (?:sharing|posting) is (?:optional|never required)/)
assert.match(modulePrd, /Google Review input is hidden/)
assert.match(modulePrd, /brandId.*sessionStorage/)

console.log('Customer game platform action-card contract passed.')
