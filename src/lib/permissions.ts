/**
 * permissions.ts — Centralized role resolution & menu configuration
 */

export type AppRole = 'ADMIN' | 'AMC_PRINCIPAL' | 'BRAND_OWNER' | 'BD'

export type BoardView =
  | 'dashboard'
  | 'calendar'
  | 'drafts'
  | 'assets'
  | 'game'
  | 'socialInsight'
  | 'dataAnalysis'
  | 'archive'
  | 'agents'
  | 'logs'
  | 'managementOverview'

export interface UserInfo {
  role?: string
  dashboardRole?: 'ADMIN' | 'BRAND_OWNER' | 'BRAND_DIRECTOR'
  userRoles?: string[]
}

/** Resolve AppRoles from the user object returned by /api/auth/me */
export function resolveRoles(user: UserInfo | null): AppRole[] {
  if (!user) return []
  if (user.userRoles && user.userRoles.length > 0) {
    const valid: AppRole[] = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD']
    return user.userRoles.filter((r): r is AppRole => valid.includes(r as AppRole))
  }
  if (user.role === 'ADMIN') return ['ADMIN']
  if (user.dashboardRole === 'BRAND_OWNER') return ['BRAND_OWNER']
  if (user.dashboardRole === 'BRAND_DIRECTOR') return ['AMC_PRINCIPAL']
  return []
}

/** Check whether a set of roles can navigate to a given view */
export function canAccessView(roles: AppRole[], view: BoardView): boolean {
  const isAdmin = roles.includes('ADMIN')
  const isPrincipal = roles.includes('AMC_PRINCIPAL')
  const isOwner = roles.includes('BRAND_OWNER')
  switch (view) {
    case 'dashboard':
    case 'calendar':
    case 'drafts':
    case 'assets':
    case 'game':
      return isAdmin || isPrincipal || isOwner
    case 'socialInsight':
      return isAdmin || isPrincipal || isOwner
    case 'dataAnalysis':
      return isAdmin || isPrincipal
    case 'archive':
    case 'managementOverview':
      return isAdmin || isPrincipal
    case 'agents':
    case 'logs':
      return isAdmin || isPrincipal || isOwner
    default:
      return isAdmin
  }
}

export type MenuItemDef = {
  id: string
  view: BoardView
  label: string
  icon: string
  comingSoon?: boolean
  /** External href — overrides view switching */
  href?: string
}

export type MenuGroupDef = {
  /** Display label for the group header. null = no label */
  groupLabel: string | null
  items: MenuItemDef[]
  /**
   * true = this section is the brand-level section.
   * Sidebar renders an inline brand switcher as the section header.
   */
  isBrandSection?: boolean
  /**
   * true = this section contains only coming-soon items (BD placeholder).
   */
  isComingSoon?: boolean
}

/**
 * Return the ordered sidebar menu groups for the given roles.
 * Order: 主理人 → 品牌主 → BD → Admin
 */
export function getMenuGroups(roles: AppRole[]): MenuGroupDef[] {
  const isAdmin     = roles.includes('ADMIN')
  const isPrincipal = roles.includes('AMC_PRINCIPAL')
  const isOwner     = roles.includes('BRAND_OWNER')
  const isBD        = roles.includes('BD')

  const canBrandOps = isAdmin || isPrincipal || isOwner
  const canManage   = isAdmin || isPrincipal

  const groups: MenuGroupDef[] = []

  // ── 1. 主理人 (Admin / Principal) ────────────────────────────────
  if (canManage) {
    groups.push({
      groupLabel: '主理人',
      items: [
        { id: 'managementOverview', view: 'managementOverview', label: '主理人总览', icon: 'Users' },
        { id: 'archive',            view: 'archive',            label: '归档',       icon: 'Inbox' },
      ],
    })
  }

  // ── 2. 品牌主 (Brand-level ops — inline brand switcher as header) ─
  if (canBrandOps) {
    const brandItems: MenuItemDef[] = [
      { id: 'dashboard',    view: 'dashboard',    label: '品牌主看板',      icon: 'LayoutDashboard' },
      { id: 'calendar',     view: 'calendar',     label: '发布日历',        icon: 'Calendar' },
      { id: 'drafts',       view: 'drafts',       label: '发布内容 (Post)', icon: 'FileText' },
      { id: 'assets',       view: 'assets',       label: '素材库',          icon: 'Images' },
      { id: 'game',         view: 'game',         label: '店内活动',        icon: 'Gift' },
      { id: 'socialInsight',view: 'socialInsight',label: '数据分析',        icon: 'BarChart2' },
    ]
    // Snapshot only for admin/principal
    if (isAdmin || isPrincipal) {
      brandItems.push({ id: 'dataAnalysis', view: 'dataAnalysis', label: '账号快照', icon: 'Camera' })
    }
    brandItems.push(
      { id: 'agents', view: 'agents', label: 'AI 序列',  icon: 'Bot' },
      { id: 'logs',   view: 'logs',   label: '工作日志', icon: 'Activity' },
    )
    groups.push({
      groupLabel: '品牌主',
      isBrandSection: true,
      items: brandItems,
    })
  }

  // ── 3. BD 商务 (coming soon placeholder) ─────────────────────────
  if (isBD || isAdmin) {
    groups.push({
      groupLabel: 'BD 商务',
      isComingSoon: true,
      items: [
        { id: 'bd-workspace', view: 'dashboard', label: 'BD 工作台', icon: 'Briefcase',  comingSoon: true },
        { id: 'bd-clients',   view: 'dashboard', label: '客户汇总',  icon: 'Users',      comingSoon: true },
        { id: 'bd-revenue',   view: 'dashboard', label: '收入总览',  icon: 'TrendingUp', comingSoon: true },
      ],
    })
  }

  // ── 4. Admin 系统 ─────────────────────────────────────────────────
  if (isAdmin) {
    groups.push({
      groupLabel: '系统',
      items: [
        { id: 'admin', view: 'dashboard', label: 'Admin 控制台', icon: 'Shield', href: '/admin' },
      ],
    })
  }

  return groups
}
