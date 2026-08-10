import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const staticRoot = resolve(process.cwd(), '..', 'amc-content', 'src', 'static')
const files: Record<string, [string, string]> = {
  '/admin/video-production': ['video-production.html', 'text/html; charset=utf-8'],
  '/admin/video-production/styles.css': ['video-production.css', 'text/css; charset=utf-8'],
  '/admin/video-production/app.js': ['video-production.js', 'text/javascript; charset=utf-8'],
  '/admin/shell.css': ['admin-shell.css', 'text/css; charset=utf-8'],
  '/admin/shell.js': ['admin-shell.js', 'text/javascript; charset=utf-8'],
}
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  const file = files[pathname]
  if (!file) { response.statusCode = 404; response.end('not found'); return }
  response.setHeader('content-type', file[1])
  response.end(await readFile(resolve(staticRoot, file[0])))
})
await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
const address = server.address()
assert(address && typeof address === 'object')

const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(chromium.executablePath()) ? undefined : existsSync(systemChrome) ? systemChrome : undefined,
})
try {
  const page = await browser.newPage({ acceptDownloads: true })
  const project = { id: 'project-1', brandId: 'brand-1', title: '流心蛋黄酥视频', platform: 'tiktok', objective: '突出流心和新鲜出炉', currentStage: 'reference', status: 'draft', referenceAssetId: 'asset-1', referenceMediaId: 'media-1', updatedAt: new Date().toISOString() }
  let projects: any[] = []
  let assets: any[] = []
  let jobs: any[] = []
  let version = 0
  const newAsset = (assetType: string, status = 'ready_for_review', payload: any = {}) => ({
    id: `asset-version-${++version}`, projectId: project.id, assetType, businessVersion: 1,
    schemaVersion: `${assetType}@1`, parentAssetIds: [], inputHash: `hash-${version}`, status, payload,
    provenance: { profileId: 'profile-1', modelName: 'test-model', latencyMs: 25 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
  const json = (route: any, value: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })

  await page.route('**/v1/lab/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let body: any = {}
    if (request.postData()) {
      try { body = request.postDataJSON() } catch { body = {} }
    }
    if (path === '/v1/lab/catalog') return json(route, { brands: [{ id: 'brand-1', name: '蛋黄酥店' }] })
    if (path === '/v1/lab/inspiration-assets') return json(route, { items: [{ id: 'asset-1', title: '爆款流心蛋黄酥', platform: 'tiktok', sourceUrl: 'https://media.test/reference.mp4', media: [{ id: 'media-1', kind: 'video', mimeType: 'video/mp4', originalFilename: 'reference.mp4', readUrl: 'https://media.test/reference.mp4' }] }] })
    if (path === '/v1/lab/models') return json(route, { providers: [], profiles: [{ id: 'profile-1', displayName: 'Video Analyzer' }] })
    if (path === '/v1/lab/model-tasks') return json(route, { items: [{ task: 'reference_video_analysis', eligibleProfileIds: ['profile-1'] }] })
    if (path === '/v1/lab/video-readiness') return json(route, { ready: true, checks: {} })
    if (path === '/v1/lab/video-projects' && request.method() === 'GET') return json(route, { items: projects })
    if (path === '/v1/lab/video-projects' && request.method() === 'POST') { projects = [project]; return json(route, project) }
    if (path === `/v1/lab/video-projects/${project.id}`) return json(route, project)
    if (path === `/v1/lab/video-projects/${project.id}/assets`) return json(route, { items: assets })
    if (path === `/v1/lab/video-projects/${project.id}/jobs`) return json(route, { projectId: project.id, jobs })
    if (path.endsWith('/analyze')) { assets.push(newAsset('ReferenceVideoAnalysis', 'ready_for_review', { hook: { summary: '掰开流心' }, scores: { memorability: 9, novelty: 8, innovation: 7 } })); project.currentStage = 'analysis'; project.status = 'ready_for_review'; return json(route, { ok: true }) }
    if (/\/v1\/lab\/video-assets\/[^/]+$/.test(path) && request.method() === 'PATCH') { const item = assets.find((asset) => path.endsWith(asset.id)); item.status = body.decision; if (item.assetType === 'FinalVideo' && body.decision === 'approved') { project.currentStage = 'complete'; project.status = 'complete' } return json(route, item) }
    if (path.endsWith('/plan')) { for (const type of ['SellingPointPackage', 'ScriptPackage', 'Storyboard', 'PromptBundle']) assets.push(newAsset(type)); project.currentStage = 'planning'; return json(route, { ok: true }) }
    if (path.endsWith('/estimate')) return json(route, { confirmation: { id: 'cost-1', currency: 'USD', estimatedAmount: 1.23, expiresAt: new Date(Date.now() + 900000).toISOString(), breakdown: { estimateAvailable: true } }, jobs: Array.from({ length: 6 }) })
    if (path.endsWith('/submit')) { jobs = ['variant-a', 'variant-b', 'variant-c'].flatMap((variant) => [1, 2].map((scene) => ({ id: `${variant}-${scene}`, brandId: 'brand-1', projectId: project.id, variantId: variant, sceneId: `scene-${scene}`, status: 'completed', provider: 'mock', modelName: 'mock-video', outputMedia: { id: `${variant}-media-${scene}`, url: `https://media.test/${variant}-${scene}.mp4`, mimeType: 'video/mp4' } }))); project.currentStage = 'generation'; project.status = 'processing'; return json(route, { ok: true }) }
    if (path.endsWith('/assemble')) { assets.push(newAsset('FinalVideo', 'ready_for_review', { variantId: body.variantId, mediaAssets: [{ id: 'final-1', url: 'https://media.test/final.mp4', mimeType: 'video/mp4', filename: 'final-9x16.mp4' }], similarityReview: { blocked: false } })); project.currentStage = 'assembly'; project.status = 'ready_for_review'; return json(route, { ok: true }) }
    if (path.includes('/download/')) return route.fulfill({ status: 200, headers: { 'content-type': 'video/mp4' }, body: Buffer.from('mock-video') })
    return json(route, { error: `unmocked ${request.method()} ${path}` }, 404)
  })
  await page.route('https://media.test/**', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('') }))

  const payload = Buffer.from(JSON.stringify({ sub: 'admin-1', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  await page.goto(`http://127.0.0.1:${address.port}/admin/video-production#labToken=${payload}.test`)
  await page.getByRole('button', { name: '创建' }).click()
  await page.locator('#projectBrand').selectOption('brand-1')
  await page.locator('#projectName').fill('流心蛋黄酥视频')
  await page.locator('#referenceVideo').selectOption('asset-1::media-1')
  await page.getByRole('button', { name: '创建并进入项目' }).click()
  await page.getByRole('button', { name: '生成拆解卡' }).click()
  await page.locator('[data-review="approved"]').click()
  await page.getByRole('button', { name: /生成卖点/ }).click()
  for (let index = 0; index < 4; index += 1) await page.locator('[data-review="approved"]').first().click()
  await page.getByRole('button', { name: /费用估算/ }).click()
  await page.getByRole('button', { name: /确认费用/ }).click()
  await page.locator('[data-assemble="variant-a"]').click()
  await page.locator('[data-review="approved"]').click()
  const download = page.waitForEvent('download')
  await page.locator('[data-download-asset]').click()
  assert.equal((await download).suggestedFilename(), 'final-9x16.mp4')
  console.log('SUCCESS: Playwright covered project creation, asset selection, staged review, cost confirmation, job progress, assembly and approved download')
} finally {
  await browser.close()
  server.close()
}
