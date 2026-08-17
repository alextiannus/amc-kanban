import assert from 'node:assert/strict'

import { getMenuGroups as getMenuGroupsMain } from '../src/lib/permissions.ts'
import { getMenuGroups as getMenuGroupsUserManagement } from '../src/lib/user-management/permissions.ts'

const expectedManagedGroups = [
  ['主理人', ['主理人总览', '账号快照', '素材执行']],
  ['内容中心', ['视频生产', '爆品脚本', 'AI 角色库']],
  ['知识增长中心', ['品牌灵感', '推广计划', '知识库']],
]

function managedGroupShape(getMenuGroups: typeof getMenuGroupsMain) {
  return getMenuGroups(['ADMIN'])
    .slice(0, 3)
    .map((group) => [group.groupLabel, group.items.map((item) => item.label)])
}

assert.deepEqual(managedGroupShape(getMenuGroupsMain), expectedManagedGroups)
assert.deepEqual(managedGroupShape(getMenuGroupsUserManagement), expectedManagedGroups)

for (const getMenuGroups of [getMenuGroupsMain, getMenuGroupsUserManagement]) {
  const researcherGroups = getMenuGroups(['RESEARCHER'])
  assert.deepEqual(researcherGroups.map((group) => group.groupLabel), ['内容中心'])
  assert.deepEqual(
    researcherGroups[0]?.items.map((item) => item.label),
    ['爆品脚本', 'AI 角色库'],
    'Researcher content access must not include retired material navigation or video production',
  )
}

console.log('Sidebar menu groups are organized under Content Center and Knowledge Growth Center')
