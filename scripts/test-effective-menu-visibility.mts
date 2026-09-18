import assert from 'node:assert/strict'
import { getMenuGroups, canAccessView } from '../src/lib/permissions.ts'

const menus = (roles: Parameters<typeof getMenuGroups>[0], grants: string[]) => getMenuGroups(roles, grants)
const labels = (roles: Parameters<typeof getMenuGroups>[0], grants: string[]) => menus(roles, grants).flatMap(group => group.items.map(item => item.label))

const accountGrants = ['brand.read', 'content.read', 'draft.read', 'asset.read', 'game.read', 'analytics.read', 'work_log.read', 'content.video-making.read', 'content.inspiration-library.read', 'content.video-production.read', 'content.inspiration-tags.read']
const actual = menus(['BRAND_OWNER'], accountGrants)
assert.ok(actual.some(group => group.groupLabel === '工作区' && group.items.some(item => item.label === '工作日志')))
assert.ok(!actual.some(group => group.groupLabel === 'Admin'))
assert.ok(labels(['BRAND_OWNER'], accountGrants).includes('品牌策划'))
assert.ok(labels(['BRAND_OWNER'], accountGrants).includes('爆款复刻'))
assert.ok(!labels(['BRAND_OWNER'], accountGrants).includes('内容控制台'))
assert.ok(!labels(['BRAND_OWNER'], accountGrants).includes('AI 角色库'))
assert.ok(labels([], ['content.skills.read']).includes('规则与技能'))
assert.deepEqual(menus([], []), [])
assert.equal(canAccessView([], 'dashboard', ['content.skills.read']), false)
assert.ok(menus(['ADMIN'], []).some(group => group.groupLabel === 'Admin'))
console.log('Effective menu visibility checks passed')
