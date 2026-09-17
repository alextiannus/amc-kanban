import { ACTION_LABELS, MENU_PERMISSIONS, PERMISSION_MODULES, permissionSources } from './contract.ts'
import { check, type AccessEntry, type Context } from '../access-overview/types.ts'
export function describePolicy(rows: AccessEntry[], context: Context, policies: Record<string, string[]>, contentReady: boolean): AccessEntry[] {
  const sources = permissionSources(context.roles, policies)
  const used = new Set<string>()
  function apply(row: AccessEntry, moduleId: string): AccessEntry {
    const module = PERMISSION_MODULES.find(m => m.id === moduleId)
    if (!module) return row
    used.add(module.id)
    const read = context.active !== false && Boolean(sources[`${module.id}.read`])
    const ready = context.active === false || row.system !== 'content' || contentReady
    const scoped = module.scope === '已授权品牌' && !context.roles.includes('ADMIN')
    const menu = !ready ? check('unknown', 'Content 权限执行版本尚未核实') : check(read ? 'allowed' : 'denied', context.active === false ? '账号已停用' : read ? `授权来源：${sources[`${module.id}.read`].join('、')}` : '全部角色均未授予模块查看权限')
    const page = menu.state !== 'allowed' ? menu : scoped && context.brandScope !== 'allowed' ? check(context.brandScope === 'denied' ? 'denied' : 'conditional', context.brandScope === 'denied' ? '没有该品牌授权' : '需要选择已授权品牌') : menu
    return { ...row, menu, page, status: page.state, scope: module.scope, notes: ['多角色授权取并集；接口仍校验品牌范围、业务状态和资源归属。'], sources: ['RolePermissionPolicy', 'role-permissions/contract'], operations: module.actions.map(action => {
      const key = `${module.id}.${action}`, granted = read && Boolean(sources[key])
      return { label: ACTION_LABELS[action] || action, source: key, ...(!ready ? check('unknown', 'Content 权限服务未核实') : !granted ? check('denied', context.active === false ? '账号已停用' : '全部角色均未授予此操作') : scoped && context.brandScope !== 'allowed' ? page : check('allowed', `授权来源：${sources[key].join('、')}；仍需业务对象校验`)) }
    }) }
  }
  const result = rows.map(row => {
    let moduleId: string | undefined
    if (row.system === 'content') moduleId = `content.${row.id.split(':')[1] === 'agent-detail' ? 'content-lab' : row.id.split(':')[1]}`
    else {
      const id = row.id.split(':')[1]
      const key = MENU_PERMISSIONS[id]
      moduleId = key?.slice(0, key.lastIndexOf('.'))
      if (id === 'legacy-ai-roles') moduleId = 'content.content-lab'
      if (id === 'creative-detail') moduleId = 'content.inspiration-library'
    }
    return moduleId ? apply(row, moduleId) : row
  })
  for (const module of PERMISSION_MODULES) if (!used.has(module.id)) result.push(apply({ id: `${module.system}:policy-${module.id}`, system: module.system, label: module.label, group: '功能权限', menu: check('na', '功能项'), page: check('na', '功能项'), operations: [], scope: module.scope, sources: [], status: 'na', notes: [] }, module.id))
  return result
}
