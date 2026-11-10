import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const output = '/tmp/amc-tiktok-brand-ui'
await mkdir(output, { recursive: true })
const bundle = await build({
  stdin: { contents: `import React,{Suspense} from 'react';import {createRoot} from 'react-dom/client';import Page from './src/app/video-assistant/confirm/[id]/page';const params=Promise.resolve({id:'fixture'});createRoot(document.getElementById('app')).render(<Suspense fallback={<p>读取中</p>}><Page params={params}/></Suspense>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
})
const css = (await postcss([tailwind()]).process('@import "tailwindcss" source(none);\n@source "./src/app/video-assistant/confirm/[id]/page.tsx";', { from: path.resolve('fixture.css') })).css
let enabled = true, submitted = false, writes = 0
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return }
  if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); res.end(css); return }
  if (req.url.startsWith('/api/video-assistant/confirm/')) {
    res.setHeader('content-type', 'application/json')
    if (req.method === 'POST') { writes++; submitted = true; res.end(JSON.stringify({ ok: true, state: 'submitted' })); return }
    res.end(JSON.stringify({ kind: 'publication', expiresAt: '2026-11-10T12:15:00Z', execution: submitted ? { state: 'submitted' } : null,
      project: { title: '自有品牌推广测试', assets: [], shots: [] }, previews: [], scheduledAt: '2026-11-10T13:30:00Z',
      post: { caption: '测试内容，不会发送到真实平台。', account: { displayName: 'Fixture account', handle: 'fixture', platformId: 'tiktok' },
        postfastControls: { ...(enabled === undefined ? {} : { tiktokBrandOrganic: enabled }), tiktokIsAigc: false } },
    })); return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="app"></div><script src="/app.js"></script></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = 'http://127.0.0.1:' + server.address().port
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const value of [true, false, undefined]) {
      enabled = value; await page.goto(url)
      await page.getByRole('button', { name: '确认账号、内容与排期，提交发布' }).waitFor()
      const text = await page.locator('main').innerText()
      assert.equal(text.includes('自有品牌推广披露'), value !== undefined)
      assert.equal(text.includes('tiktokBrandOrganic'), false)
      assert.equal(text.includes('Invalid Date'), false)
      if (value !== undefined) assert.match(text, new RegExp('自有品牌推广披露\\s*' + (value ? '是' : '否')))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      if (value === true) await page.screenshot({ path: path.join(output, 'disclosure-' + width + '.png'), fullPage: true })
    }
  }
  enabled = true; await page.reload()
  await page.getByRole('button', { name: '确认账号、内容与排期，提交发布' }).click()
  await page.getByText('已提交发布队列。请返回原对话查看真实投递结果。').waitFor()
  await page.reload(); await page.getByText('已提交发布队列。请返回原对话查看真实投递结果。').waitFor()
  assert.equal(writes, 1); assert.equal(await page.locator('main button').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS isolated confirmation UI: own-brand on/off/omitted label, 320/390/1440 layout, single fixture submit and reload recovery; no external requests')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
