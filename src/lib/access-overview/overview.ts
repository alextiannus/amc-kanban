import { describeKanban, finalizeEntries } from './catalog.ts'
import { selectContentRole } from './entry-rules.ts'
import { check, CONTRACT_VERSION, RULE_VERSION, ROLES, entryStatus, type AccessEntry, type Context, type Overview } from './types.ts'

export type ContentSnapshot = { contractVersion: number; ruleVersion: string; roles: Record<string, AccessEntry[]> }
export type RemoteContent = { snapshot?: ContentSnapshot; reason?: string }
const fallbackFeatures = [
  ['dashboard', '控制台'], ['video-making', '视频制作'], ['video-production', '爆款复刻'], ['inspiration-library', '灵感星链 / 爆品脚本'],
  ['inspiration-tags', '标签库'], ['content-lab', 'Agent 与实验 / AI 角色库'], ['skills', '规则与技能'], ['knowledge', '数据与知识'],
  ['records', '记录与审核'], ['models', '模型与路由'], ['login', '直接账号登录'],
  ['agent-detail', 'Agent 详情'],
]
export function parseContentSnapshot(data: unknown): ContentSnapshot | null {
  if (!data || typeof data !== 'object') return null
  const value = data as ContentSnapshot
  if (value.contractVersion !== CONTRACT_VERSION || value.ruleVersion !== RULE_VERSION || !value.roles) return null
  const states = new Set(['allowed', 'denied', 'conditional', 'comingSoon', 'conflict', 'unknown', 'na'])
  const validCheck = (value: unknown) => !!value && typeof value === 'object' && states.has((value as { state: string }).state) && typeof (value as { reason: unknown }).reason === 'string'
  for (const role of ROLES) {
    const rows = value.roles[role]
    if (!Array.isArray(rows) || rows.length !== fallbackFeatures.length) return null
    if (new Set(rows.map(row => row?.id)).size !== rows.length) return null
    if (!fallbackFeatures.every(([id]) => rows.some(row => row?.id === `content:${id}`))) return null
    if (!rows.every(row => row.system === 'content' && typeof row.label === 'string' && typeof row.group === 'string'
      && (row.href === undefined || typeof row.href === 'string') && (row.aliases === undefined || Array.isArray(row.aliases) && row.aliases.every(alias => typeof alias === 'string'))
      && typeof row.scope === 'string' && states.has(row.status) && validCheck(row.menu) && validCheck(row.page)
      && Array.isArray(row.operations) && row.operations.every(op => validCheck(op) && typeof op.label === 'string' && typeof op.source === 'string')
      && Array.isArray(row.notes) && row.notes.every(item => typeof item === 'string')
      && Array.isArray(row.sources) && row.sources.every(item => typeof item === 'string'))) return null
  }
  return { contractVersion: value.contractVersion, ruleVersion: value.ruleVersion, roles: Object.fromEntries(ROLES.map(role => [role, value.roles[role].map(row => ({
    id: row.id, system: row.system, group: row.group, label: row.label, href: row.href, aliases: row.aliases,
    menu: { state: row.menu.state, reason: row.menu.reason }, page: { state: row.page.state, reason: row.page.reason },
    operations: row.operations.map(op => ({ label: op.label, state: op.state, reason: op.reason, source: op.source })),
    scope: row.scope, status: row.status, sources: row.sources, notes: row.notes,
  }))])) }
}

export function describeContent(context: Context, remote: RemoteContent): AccessEntry[] {
  if (!remote.snapshot) return finalizeEntries(fallbackFeatures.map(([id, label]) => ({
    id: `content:${id}`, system: 'content', label, group: 'Content（未核实）',
    menu: check('unknown', remote.reason || 'Content 未返回兼容的权限说明'), page: check('unknown', remote.reason || 'Content 未返回兼容的权限说明'),
    operations: [], scope: '未核实', status: 'unknown', sources: [], notes: ['不使用过期或本地猜测的权限结果。'],
  })), context)
  const role = selectContentRole(context.roles, true) || 'BRAND_OWNER'
  const rows = remote.snapshot.roles[role].map(row => {
    const scoped = ['content:video-making', 'content:video-production'].includes(row.id)
    if (!scoped || role === 'ADMIN' || row.page.state === 'denied') return row
    const scope = context.brandScope === 'denied' ? check('denied', '所选品牌未授权，Kanban 不能签发此品牌入口凭证')
      : context.brandScope === 'allowed' ? check('conditional', '品牌已授权；进入 Content 时仍需携带品牌凭证，现有会话未核验')
        : check('conditional', '需要选择已授权品牌并从 Kanban 视频入口进入；其他入口的凭证可能不含品牌')
    return { ...row, page: scope, status: entryStatus(row.menu, scope), operations: row.operations.map(op => op.state === 'denied' ? op : { ...op, ...scope }) }
  })
  return finalizeEntries(rows, context)
}

export function buildOverview(remote: RemoteContent, context?: Context): Overview {
  const result: Overview = {
    contractVersion: CONTRACT_VERSION, ruleVersion: RULE_VERSION, generatedAt: new Date().toISOString(),
    evidence: '根据当前服务代码与最新账号关系计算；未登录被查看账号，未验证浏览器旧会话、业务对象、订阅或第三方服务状态。',
    content: remote.snapshot ? { state: 'available', ruleVersion: remote.snapshot.ruleVersion } : { state: 'unavailable', reason: remote.reason || 'Content 未核实' },
    roles: ROLES, conflicts: [],
  }
  const evaluate = (value: Context) => [...describeKanban(value), ...describeContent(value, remote)]
  if (context) result.entries = evaluate(context)
  else result.matrix = Object.fromEntries(ROLES.map(role => [role, evaluate({ roles: [role], brandScope: 'unselected' })])) as Record<(typeof ROLES)[number], AccessEntry[]>
  const rows = result.entries || Object.values(result.matrix || {}).flat()
  result.conflicts = Array.from(new Set(rows.filter(row => row.status === 'conflict').map(row => `${row.label}：${row.menu.reason}；${row.page.reason}`)))
  return result
}

export async function fetchContentOverview(options: { baseUrl?: string; token?: string; fetcher?: typeof fetch }): Promise<RemoteContent> {
  if (!options.baseUrl || !options.token) return { reason: 'Content 地址或内部认证尚未配置' }
  try {
    const response = await (options.fetcher || fetch)(`${options.baseUrl.replace(/\/+$/, '')}/v1/internal/access-overview`, {
      method: 'GET', headers: { 'x-content-service-token': options.token }, cache: 'no-store', signal: AbortSignal.timeout(5000), redirect: 'error',
    })
    if (!response.ok) return { reason: `Content 权限接口不可用（HTTP ${response.status}）` }
    const snapshot = parseContentSnapshot(await response.json())
    return snapshot ? { snapshot } : { reason: 'Content 权限协议、规则版本或返回结构不匹配' }
  } catch { return { reason: 'Content 权限接口连接失败或超时，请刷新重试' } }
}
