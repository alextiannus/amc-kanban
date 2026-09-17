// Versioned wire contract. Keep byte-identical with amc-content/src/permissionContract.ts.
export const PERMISSION_PROTOCOL = 2
export type RoleDefinition = { id: string; name: string; description: string; builtIn: boolean; enabled: boolean; version: number; memberCount?: number }
export const POLICY_ROLES = ['AMC_PRINCIPAL', 'BRAND_OWNER', 'BD', 'RESEARCHER'] as const
export type PolicyRole = typeof POLICY_ROLES[number]
export type PermissionModule = { id: string; system: 'kanban' | 'content'; label: string; scope: string; actions: string[]; defaults: Partial<Record<PolicyRole, string[]>> }
const operators = ['read', 'create', 'update', 'generate', 'delete']
const contentModule = (id: string, label: string, actions: string[], researcher: string[] = [], scoped = false): PermissionModule => ({
  id: `content.${id}`, system: 'content', label, scope: scoped ? '已授权品牌' : '平台共享库', actions,
  defaults: { AMC_PRINCIPAL: actions, RESEARCHER: researcher },
})
const brandModule = (id: string, label: string, actions: string[], bd: string[] = [], researcher: string[] = []): PermissionModule => ({
  id, system: 'kanban', label, scope: '已授权品牌', actions,
  defaults: { AMC_PRINCIPAL: actions, BRAND_OWNER: actions.filter(a => id !== 'brand' || !['create', 'archive'].includes(a)), BD: bd, RESEARCHER: researcher },
})
export const PERMISSION_MODULES: PermissionModule[] = [
  brandModule('brand', '品牌资料与策划', ['read', 'create', 'update'], ['read', 'create'], ['read']),
  brandModule('asset', '素材库', ['read', 'create', 'update', 'archive']),
  brandModule('draft', '发布内容', ['read', 'create', 'update', 'submit', 'approve', 'reject']),
  brandModule('content', '内容创建和发布计划', ['read', 'schedule', 'publish', 'retry']),
  brandModule('game', '店内活动', ['read', 'create', 'update', 'delete']),
  brandModule('analytics', '数据分析与账号快照', ['read']),
  brandModule('review', '评价管理', ['read', 'reply']),
  brandModule('action_item', '行动事项', ['read', 'create', 'resolve']),
  brandModule('work_log', '工作日志', ['read']),
  { id: 'agent', system: 'kanban', label: '品牌 AI 员工', scope: '已授权品牌', actions: ['read', 'manage'], defaults: { AMC_PRINCIPAL: ['read', 'manage'] } },
  { id: 'subscription', system: 'kanban', label: '订阅业务', scope: '已授权品牌', actions: ['read', 'manage'], defaults: { BD: ['read', 'manage'] } },
  contentModule('dashboard', '内容控制台', ['read'], ['read']),
  contentModule('video-making', '视频制作', operators, [], true),
  contentModule('video-production', '爆款复刻', operators, [], true),
  contentModule('inspiration-library', '灵感星链 / 爆品脚本', ['read', 'create', 'update', 'generate', 'review', 'publish', 'delete', 'export'], ['read', 'create', 'export']),
  contentModule('inspiration-tags', '标签库', ['read', 'create', 'update', 'review', 'generate', 'delete'], ['read']),
  contentModule('content-lab', 'AI 角色库 / Agent 与实验', ['read', 'update', 'generate']),
  contentModule('skills', '规则与技能', ['read', 'update']),
  contentModule('knowledge', '数据与知识', ['read']),
  contentModule('records', '记录与审核', ['read', 'review']),
]
export const PERMISSION_KEYS = PERMISSION_MODULES.flatMap(m => m.actions.map(a => `${m.id}.${a}`))
export const ACTION_LABELS: Record<string, string> = { read: '查看 / 访问', create: '创建 / 上传', update: '编辑', generate: '生成 / 分析', delete: '删除', archive: '归档', submit: '提交审核', approve: '审核通过', reject: '审核拒绝', schedule: '安排发布', publish: '发布', retry: '重试', reply: '回复', resolve: '处理', manage: '管理', review: '审核', export: '导出' }
export function defaultGrants(role: string): string[] {
  if (role === 'ADMIN') return [...PERMISSION_KEYS]
  return PERMISSION_MODULES.flatMap(m => (m.defaults[role as PolicyRole] || []).map(a => `${m.id}.${a}`))
}
export function validateGrants(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(k => typeof k !== 'string' || !PERMISSION_KEYS.includes(k))) throw new Error('包含未知或不可配置权限')
  const grants = [...new Set(value as string[])].sort()
  for (const m of PERMISSION_MODULES) if (m.actions.some(a => a !== 'read' && grants.includes(`${m.id}.${a}`)) && !grants.includes(`${m.id}.read`)) throw new Error(`${m.label}的操作需要查看权限`)
  return grants
}
export function effectiveGrants(roles: readonly string[], policies: Record<string, string[]>): string[] {
  if (roles.includes('ADMIN')) return [...PERMISSION_KEYS]
  return [...new Set(roles.flatMap(role => policies[role] ?? defaultGrants(role)))].sort()
}
export function permissionSources(roles: readonly string[], policies: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(effectiveGrants(roles, policies).map(key => [key, roles.filter(role => role === 'ADMIN' || (policies[role] ?? defaultGrants(role)).includes(key))]))
}
export const MENU_PERMISSIONS: Record<string, string> = {
  dashboard: 'brand.read', calendar: 'content.read', drafts: 'draft.read', assets: 'asset.read', game: 'game.read',
  socialInsight: 'analytics.read', dataAnalysis: 'analytics.read', logs: 'work_log.read',
  'video-production': 'content.video-making.read', 'viral-copy-scripts': 'content.inspiration-library.read', 'amc-content-roles': 'content.content-lab.read',
}
