import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [sidebar, page, entry] = await Promise.all([
  read('src/components/layout/Sidebar.tsx'),
  read('src/app/admin/video-production/page.tsx'),
  read('src/lib/role-permissions/content-entry.tsx'),
])
assert.match(sidebar, /activeBrand\.id/)
assert.match(sidebar, /brandId=/)
assert.match(page, /authenticateCurrentSession/)
assert.match(page, /allows\(principal,'content\.video-making\.read'\)/)
assert.match(page, /canAccessBrandScope\(principal,brandId\)/)
assert.match(page, /https:\/\/amc-mm\.immedi\.ai\/dashboard/)
assert.match(page, /videoEditor:'1'/)
assert.match(entry, /authenticateCurrentSession/)
assert.match(entry, /allows\(principal, `content\.\$\{module\}\.read`\)/)
assert.match(entry, /canAccessBrandScope\(principal, brandId\)/)
assert.match(entry, /needsBrand.*!brandId/)
assert.match(entry, /signAccessIdentity\(principal, brandId\)/)
assert.doesNotMatch(entry, /AMC_PRINCIPAL|RESEARCHER/)
console.log('SUCCESS: Content entry uses current module permissions, independent brand scope, and signed identity')
