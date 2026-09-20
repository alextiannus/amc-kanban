import { OperationsError } from './service'
export const operationsJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export function operationsFailure(error: unknown) {
  if (error instanceof OperationsError) return operationsJson({ error: error.message }, error.status)
  if (error instanceof SyntaxError) return operationsJson({ error: '请求内容无效' }, 400)
  if (['P2034', 'P2002'].includes(String((error as { code?: string })?.code))) return operationsJson({ error: '品牌成员已变更，请刷新后重试' }, 409)
  console.error('[brand-operations]', error)
  return operationsJson({ error: '品牌运营数据暂时不可用，请稍后重试' }, 503)
}
