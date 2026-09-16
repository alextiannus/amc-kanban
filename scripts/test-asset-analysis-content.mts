import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { analysisContent, assetAnalysisContentConfig } from '../src/lib/asset-analysis/content.ts'

function load(file: string, dependencies: Record<string, any>) {
  const exports = {}
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports, require: (id: string) => { if (!(id in dependencies)) throw Error(`Unexpected dependency ${id}`); return dependencies[id] }, console, Date, URL, Error, process })
  return exports as any
}
Object.assign(process.env, { NODE_ENV: 'production', AMC_CONTENT_SERVICE_URL: 'https://content.test/', AMC_CONTENT_SERVICE_TOKEN: 'existing-content-token', AMC_CONTENT_REMOTE_ENABLED: 'true' })
delete process.env.APP_BASE_URL; delete process.env.JWT_SECRET
const originalFetch = globalThis.fetch
const calls: Array<{ url: string; init: RequestInit }> = []
let available = true
globalThis.fetch = (async (url, init) => {
  calls.push({ url: String(url), init: init || {} })
  if (!available) return Response.json({ error: 'Content image analysis unavailable' }, { status: 503 })
  return Response.json(String(url).endsWith('/capabilities') ? { tasks: ['asset_image_analysis', 'asset_category_summary'].map(task => ({ task, configured: true, models: ['doubao-seed-2.1-turbo'] })) } : { id: 'old:job/1', status: 'succeeded' })
}) as typeof fetch
try {
  const config = assetAnalysisContentConfig()
  assert.equal(config.baseUrl, 'https://content.test')
  await analysisContent(config, '/v1/capabilities')
  assert.equal(calls.at(-1)!.url, 'https://content.test/v1/asset-analysis/capabilities')
  const payload = { clientJobId: 'item', idempotencyKey: 'old:key', taskType: 'asset_image_analysis' }
  await analysisContent(config, '/v1/jobs', payload)
  assert.equal(calls.at(-1)!.url, 'https://content.test/v1/asset-analysis/jobs')
  assert.equal(calls.at(-1)!.init.body, JSON.stringify(payload))
  await analysisContent(config, '/v1/jobs/' + encodeURIComponent('old:job/1'))
  assert.equal(new URL(calls.at(-1)!.url).searchParams.get('jobId'), 'old:job/1')
  for (const call of calls) {
    assert.equal(new Headers(call.init.headers).get('authorization'), 'Bearer existing-content-token')
    assert.equal(new Headers(call.init.headers).get('x-amc-signature'), null)
  }
  await assert.rejects(analysisContent(config, '/v1/jobs/x/retry', {}), /Unsupported/)
  let current: any = { id: 'default', assetAnalysisEnabled: false, assetAnalysisGatewayUrl: 'https://old-gateway.test', assetAnalysisGatewaySecret: 'old-secret' }
  const updates: any[] = [], audits: any[] = []
  const prisma = { systemConfig: { findUnique: async () => current, update: async ({ data }: any) => { updates.push(data); current = { ...current, ...data }; return current } }, auditLog: { create: async (args: any) => audits.push(args) } }
  const system = load('../src/lib/systemConfig.ts', { './prisma.ts': { prisma }, './asset-analysis/content': { assetAnalysisContentConfig } })
  assert.equal(await system.getAssetAnalysisConfig(), null)
  current.assetAnalysisEnabled = true
  assert.equal((await system.getAssetAnalysisConfig()).baseUrl, 'https://content.test')
  assert(!JSON.stringify(await system.getAssetAnalysisConfig()).includes('old-secret'))
  let allowed = true
  const route = load('../src/app/api/admin/system-config/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': { getSession: async () => ({ user: { id: 'admin', email: 'admin@test' } }) },
    '@/lib/prisma': { prisma }, '@/lib/systemConfig': { ensureSystemConfig: async () => current },
    '@/lib/asset-analysis/content': { analysisContent, assetAnalysisContentConfig }, '@/lib/amcOperator': { isAmcOperator: () => allowed },
  })
  const get = await (await route.GET()).json()
  assert.equal(get.assetAnalysisGatewayUrl, undefined); assert.equal(get.assetAnalysisGatewaySecret, undefined)
  const patch = (body: any) => route.PATCH(new Request('https://kanban.test/api/admin/system-config', { method: 'PATCH', body: JSON.stringify(body) }))
  available = false
  const before = updates.length
  assert.equal((await patch({ assetAnalysisEnabled: true })).status, 422)
  assert.equal(updates.length, before)
  assert.equal((await patch({ assetAnalysisEnabled: false })).status, 200, 'Disabling does not require Content availability')
  available = true
  const response = await patch({ assetAnalysisEnabled: true, assetAnalysisGatewayUrl: 'https://ignored.test', assetAnalysisGatewaySecret: 'ignored' })
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.equal(saved.assetAnalysisEnabled, true)
  assert.equal(saved.assetAnalysisGatewaySecret, undefined)
  assert.equal(updates.at(-1).assetAnalysisGatewaySecret, undefined)
  assert(!JSON.stringify(audits).includes('old-secret'))
  allowed = false
  assert.equal((await route.GET()).status, 403)
  assert.equal((await patch({ assetAnalysisEnabled: true })).status, 403)
  process.env.AMC_CONTENT_REMOTE_ENABLED = 'false'
  assert.throws(assetAnalysisContentConfig, /not configured/)
  const ui = readFileSync(new URL('../src/components/admin/AssetAnalysisConfig.tsx', import.meta.url), 'utf8')
  assert(!/assetAnalysisGateway|type="password"|type="url"/.test(ui))
  console.log('PASS Kanban analysis via Content: existing connection, Bearer auth, original IDs, switch readiness, disabled mode, legacy-field exclusion and permissions')
} finally { globalThis.fetch = originalFetch }
