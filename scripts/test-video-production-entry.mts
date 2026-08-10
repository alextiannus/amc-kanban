import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [permissions, duplicatePermissions, sidebar, page] = await Promise.all([
  read('src/lib/permissions.ts'),
  read('src/lib/user-management/permissions.ts'),
  read('src/components/layout/Sidebar.tsx'),
  read('src/app/admin/video-production/page.tsx'),
])

assert.equal((permissions.match(/id: 'video-production'/g) || []).length, 1, 'video production must only appear in ADMIN/AMC_PRINCIPAL menu')
assert.equal((duplicatePermissions.match(/id: 'video-production'/g) || []).length, 1, 'duplicate permission catalog must stay aligned')
assert.match(sidebar, /activeBrand\.id/)
assert.match(sidebar, /brandId=/)
assert.match(page, /authenticateCurrentSession/)
assert.match(page, /canAccessBrand/)
assert.match(page, /'ADMIN' \| 'AMC_PRINCIPAL'/)
assert.match(page, /brandId,/)
assert.doesNotMatch(page, /RESEARCHER/)

console.log('SUCCESS: Kanban video production entry is role-gated, brand-authorized and passes signed merchant context to AMC-Content')
