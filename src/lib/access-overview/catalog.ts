import { getMenuGroups, canAccessView, type MenuItemDef } from '../permissions.ts'
import { hasCapability, type Capability } from '../auth-v2/capabilities.ts'
import { selectContentRole } from './entry-rules.ts'
import { check, entryStatus, ROLES, type AccessEntry, type Context, type Check } from './types.ts'

const BRAND_IDS = new Set(['dashboard', 'calendar', 'drafts', 'assets', 'game', 'socialInsight'])
const CAPABILITY_OPERATIONS: Record<string, [string, Capability][]> = {
  dashboard: [['查看品牌', 'brand.read'], ['编辑品牌', 'brand.update']],
  calendar: [['排期', 'content.schedule'], ['发布', 'content.publish']],
  drafts: [['查看草稿', 'draft.read'], ['创建草稿', 'draft.create'], ['编辑草稿', 'draft.update'], ['审核草稿', 'draft.approve'], ['发布', 'content.publish']],
  assets: [['查看素材', 'asset.read'], ['创建素材', 'asset.create'], ['编辑素材', 'asset.update'], ['归档素材', 'asset.archive']],
  logs: [['查看日志', 'work_log.read']],
}
const adminTabs = [
  ['users', '用户与权限管理'], ['brands', '托管品牌与派单'], ['system-llm', '模型路由配置'], ['system-prompts', 'Prompt 管理'],
  ['system-postfast', 'PostFast Key 池'], ['system-direct_oauth', '社媒直连配置'], ['system-smtp', '邮件网关设置'],
  ['system-scheduler', '定时任务与巡检'], ['system-templates', '消息模板管理'], ['system-contact_leads', '官网联系记录'], ['system-audit', '系统审计日志'],
]

function brandCheck(context: Context): Check {
  if (context.brandScope === 'denied') return check('denied', '没有该品牌的有效授权，或缺少 brand.read 能力')
  if (context.brandScope === 'allowed') return check('allowed', '所选品牌已通过 canAccessBrand 检查')
  return check('conditional', '需要选择已授权品牌；当前尚未选择品牌')
}

export function describeKanban(context: Context): AccessEntry[] {
  const { roles } = context
  const menuRoles = context.menuRoles || roles
  const accountRoles = context.accountRoles || menuRoles
  const visible = new Set(getMenuGroups(menuRoles, context.grants).flatMap(group => group.items.map(item => item.id)))
  const all = new Map<string, { item: MenuItemDef; group: string }>()
  for (const role of ROLES) for (const group of getMenuGroups([role])) for (const item of group.items) {
    if (!all.has(item.id)) all.set(item.id, { item, group: group.groupLabel || '主导航' })
  }
  const rows: AccessEntry[] = Array.from(all.values()).map(({ item, group }) => {
    const menu = item.comingSoon && visible.has(item.id) ? check('comingSoon', '仅为菜单占位，未开放')
      : check(visible.has(item.id) ? 'allowed' : 'denied', visible.has(item.id) ? '当前角色组合可以看到此菜单' : '当前角色组合不显示此菜单')
    let page: Check
    if (item.comingSoon) page = check('comingSoon', '尚未实现')
    else if (item.id === 'managementOverview') page = check('comingSoon', '当前页面为开发中占位，尚无跨品牌汇总功能')
    else if (['user-management', 'admin'].includes(item.id)) page = check(menuRoles.includes('ADMIN') ? 'allowed' : 'denied', '后台页面读取 auth/me 角色，仅管理员可进入')
    else if (item.id === 'logs' && context.grants) page = check(context.grants.includes('work_log.read') || menuRoles.includes('ADMIN') ? 'allowed' : 'denied', '看板视图需要 work_log.read；数据接口另行鉴权')
    else if (['video-production', 'viral-copy-scripts', 'amc-content-roles'].includes(item.id)) {
      const role = selectContentRole(roles, item.id === 'viral-copy-scripts')
      page = !role ? check('denied', 'Kanban 签名入口不允许此角色')
        : item.id === 'video-production' && (role !== 'ADMIN' || context.brandScope !== 'unselected' && context.brandScope !== undefined) ? brandCheck(context)
          : check('allowed', 'Kanban 入口角色检查通过；Content 服务及配置另行核实')
    } else if (item.id === 'amc-growth') page = check(roles.some(role => ['ADMIN', 'AMC_PRINCIPAL'].includes(role)) ? 'allowed' : 'denied', '仅核对 Kanban SSO 入口；Growth 下游权限不在本期范围')
    else {
      const analyticsView = ['socialInsight', 'dataAnalysis'].includes(item.id)
      page = analyticsView && !canAccessView(menuRoles, 'socialInsight') ? check('denied', '实际页面使用 socialInsight 权限检查')
        : BRAND_IDS.has(item.id) ? brandCheck(context) : check('conditional', '视图组件可挂载；数据接口与业务对象仍需独立鉴权')
    }
    const operations = (CAPABILITY_OPERATIONS[item.id] || []).map(([label, capability]) => {
      const granted = hasCapability(roles, capability)
      const result = !granted ? check('denied', `缺少 ${capability}`)
        : BRAND_IDS.has(item.id) && context.brandScope === 'denied' ? brandCheck(context)
          : check('conditional', `${capability} 能力允许；还需品牌范围、接口及业务对象检查，未执行操作`)
      return { ...result, label, source: `src/lib/auth-v2/capabilities.ts#${capability}` }
    })
    if (!operations.length && !item.href && !item.comingSoon && item.id !== 'managementOverview') operations.push({ label: '模块数据与操作', ...check('unknown', '菜单与视图已核对；此模块操作需按实际数据接口检查'), source: 'src/components/KanbanBoard.tsx' })
    return { id: `kanban:${item.id}`, system: 'kanban', label: item.label, group, href: item.href || '/board',
      menu, page, operations, scope: BRAND_IDS.has(item.id) || item.id === 'video-production' ? '已授权品牌' : '平台 / 角色范围',
      status: item.id === 'dataAnalysis' && !visible.has(item.id) && canAccessView(menuRoles, 'socialInsight') ? 'conflict' : entryStatus(menu, page), sources: ['src/lib/permissions.ts', item.href?.startsWith('/admin/') ? `src/app${item.href}/page.tsx` : 'src/components/KanbanBoard.tsx'],
      aliases: item.id === 'viral-copy-scripts' ? ['/admin/inspiration-library'] : undefined,
      notes: item.id === 'logs' ? ['工作日志在工作区显示；需要 work_log.read，数据接口仍独立鉴权。']
        : item.id === 'dataAnalysis' ? ['菜单仅管理员和主理人可见，但实际页面复用了 socialInsight 检查，品牌主也通过该页面检查；此处按实际代码展示。']
          : !item.href && !item.comingSoon ? ['看板主要通过内部视图切换，不是独立 URL。可挂载页面不代表数据接口放行。'] : [],
    }
  })
  for (const [id, label, href, allowed] of [
    ['legacy-ai-roles', '旧 AI 角色库入口', '/admin/ai-roles', roles.some(role => ['ADMIN', 'RESEARCHER'].includes(role))],
    ['creative-detail', '灵感创意详情', '/admin/inspiration-creatives/:id', Boolean(selectContentRole(roles, true))],
  ] as const) {
    const page = check(allowed ? 'allowed' : 'denied', id === 'legacy-ai-roles' ? '旧入口仅管理员和研究员通过角色检查；Content 数据权限另行检查' : '详情入口允许管理员、主理人和研究员；还需有效创意 ID')
    rows.push({ id: `kanban:${id}`, system: 'kanban', group: '内容中心 / 其他入口', label, href,
      menu: check('na', '不是当前主导航独立菜单'), page, operations: [], status: page.state, scope: 'Content 内容库',
      sources: [id === 'legacy-ai-roles' ? 'src/app/admin/ai-roles/page.tsx' : 'src/app/admin/inspiration-creatives/[id]/page.tsx'],
      notes: id === 'legacy-ai-roles' ? ['与 /admin/content-lab 的角色规则不同，不能将两个地址视为同权限别名。研究员进入后 Content Lab 数据接口仍会拒绝。'] : [] })
  }
  for (const [id, label] of adminTabs) {
    const menu = check(menuRoles.includes('ADMIN') ? 'allowed' : 'denied', '管理后台仅管理员显示')
    const page = check(menuRoles.includes('ADMIN') ? 'allowed' : 'denied', '管理员后台入口读取账号自身角色')
    rows.push({ id: `kanban:admin-${id}`, system: 'kanban', group: '管理后台', label, href: `/admin?tab=${id}`, menu, page,
      operations: [{ label: '模块内操作', ...check('unknown', '此条目核对后台入口；具体操作需按模块接口与配置状态检查'), source: 'src/app/admin/page.tsx' }],
      scope: '平台', sources: ['src/app/admin/page.tsx'], status: entryStatus(menu, page), notes: [] })
  }
  for (const [id, label, href, allowed] of [
    ['profile', '设置中心', '/profile', true],
    ['principal-profile', '主理人看板', '/profile/principal', accountRoles.some(role => ['ADMIN', 'AMC_PRINCIPAL'].includes(role))],
    ['connect', '账号连接指引', '/connect', accountRoles.some(role => ['ADMIN', 'BRAND_OWNER'].includes(role))],
  ] as const) {
    const menu = check(allowed ? 'allowed' : 'denied', '个人中心入口展示规则')
    const page = id === 'profile' ? check('allowed', '登录账号自己的设置')
      : id === 'connect' ? check('conditional', '页面可展示公开指引；登录后的完整指引限人类管理员或品牌主')
        : check(roles.includes('ADMIN') || accountRoles.includes('AMC_PRINCIPAL') ? 'allowed' : 'denied', 'principal-dashboard API 读取管理员身份或账号显式主理人角色')
    rows.push({ id: `kanban:${id}`, system: 'kanban', group: '个人菜单', label, href, menu, page, operations: [], scope: '本人 / 授权品牌',
      sources: ['src/components/layout/UserMenu.tsx', 'src/app/profile/page.tsx'], status: entryStatus(menu, page), notes: [] })
  }
  return finalizeEntries(rows, context)
}

export function finalizeEntries(rows: AccessEntry[], context: Context): AccessEntry[] {
  return rows.map(row => {
    if (context.active !== false) return row
    const denied = check('denied', '账号已停用，不能建立有效会话；角色配置仅供参考')
    return { ...row, menu: denied, page: denied, status: 'denied', operations: row.operations.map(op => ({ ...op, ...denied })) }
  })
}
