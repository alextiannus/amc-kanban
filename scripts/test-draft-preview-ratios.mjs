import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Quick from './src/components/dashboard/QuickPreviewModal';
import Creation from './src/components/dashboard/PostPreviewModal';
import { instagramDraftMedia } from './src/lib/instagramDraftMedia';
import { orderedDraftMedia } from './src/lib/draftMedia';

localStorage.setItem('amc.ui.language', 'en');
const noop = () => {};
const base = {
  id: 'images', status: 'draft', caption: 'Opening paragraph. ' + 'Full caption. '.repeat(40) + 'Last line.',
  hashtags: ['studio'], updatedAt: '2026-11-01T00:00:00Z',
  account: { id: 'ig', platformId: 'instagram', handle: 'studio' },
  coverAsset: { id: 'cover', url: '/portrait.jpg' },
  mediaUrls: ['/landscape.jpg', '/portrait.jpg', '/square.jpg'],
  assetRefs: [{ id: 'landscape', asset: { id: 'landscape', url: '/landscape.jpg', mimeType: 'image/jpeg' } }],
};
const clipRef = { id: 'clip', asset: { id: 'clip', url: '/clip', mimeType: 'video/mp4' } };
const reel = { ...base, id: 'reel', instagramPublishType: 'REEL', mediaUrls: ['/clip'], assetRefs: [clipRef] };
const mixed = { ...base, id: 'mixed', instagramPublishType: 'TIMELINE', mediaUrls: ['/square.jpg', '/clip'], assetRefs: [clipRef] };
const legacy = { ...base, id: 'legacy', coverAsset: null, mediaUrls: [],
  assetRefs: [{ ...clipRef, order: 1 }, { ...base.assetRefs[0], order: 0 }] };
const empty = { ...base, id: 'empty', coverAsset: null, mediaUrls: [], assetRefs: [] };
window.writes = [];

function App() {
  const [draft, setDraft] = useState(base);
  const [view, setView] = useState('quick');
  window.openPreview = (view, kind = 'images') => {
    setDraft({ images: base, reel, mixed, legacy, empty }[kind]);
    setView(view);
  };
  const close = () => setView('');
  const record = operation => window.writes.push({
    operation, draftId: draft.id, mediaUrls: draft.mediaUrls, publishType: draft.instagramPublishType,
  });
  return <>
    <Quick draft={draft} brandId="brand" isOpen={view === 'quick'} onClose={close} onUpdated={noop}
      onApprove={async () => record('approve')} onRegenerate={noop} onEdit={noop} onDiscard={noop} />
    <Creation isOpen={view === 'creation'} onClose={close} selectedCopywriters={[{id:'ig',name:'Studio',platform:'instagram'}]}
      draftCaptions={{ig:draft.caption}} setDraftCaptions={noop} draftHashtags={{}} setDraftHashtags={noop}
      draftStatuses={{ig:'completed'}} isAiGenerating={false} saving={false} attachedMedia={orderedDraftMedia(draft)}
      instagramMedia={instagramDraftMedia(orderedDraftMedia(draft), {cover:draft.coverAsset, publishType:draft.instagramPublishType})}
      onCancel={close} onSaveDraft={() => record('save')} onSchedule={() => record('schedule')} onRegenerate={noop}
      onCancelCopywriter={noop} />
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
`

const js = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
})
const css = await postcss([tailwind({ base: process.cwd() })]).process(
  await readFile('src/app/globals.css', 'utf8'), { from: resolve('src/app/globals.css') },
)
const clip = Buffer.from(await readFile('scripts/fixtures/material-preview-video.base64', 'utf8'), 'base64')
const dimensions = { '/portrait.jpg': [720, 1280], '/landscape.jpg': [960, 540], '/square.jpg': [720, 720] }
const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://fixture')
  if (pathname === '/app.js') return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(js.outputFiles[0].contents)
  if (pathname === '/globals.css') return res.writeHead(200, { 'Content-Type': 'text/css' }).end(css.css)
  if (pathname === '/clip') return res.writeHead(200, { 'Content-Type': 'video/mp4' }).end(clip)
  if (dimensions[pathname]) {
    const [w, h] = dimensions[pathname]
    return res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#075985"/><rect x="4" y="4" width="${w - 8}" height="${h - 8}" stroke="#fbbf24" stroke-width="6" fill="none"/></svg>`,
    )
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><div id="root"></div><script src="/app.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = 'http://127.0.0.1:' + server.address().port

async function checkRatio(page, ratio) {
  const [width, height] = ratio.split(':').map(Number)
  const frame = page.locator(`[data-preview-ratio="${ratio}"]`)
  await frame.waitFor()
  const box = await frame.boundingBox()
  assert(box && Math.abs(box.width - box.height * width / height) < 1, `Expected a ${ratio} media frame`)
  assert.equal(await frame.locator('img, video').evaluate(el => getComputedStyle(el).objectFit), 'contain')
}

let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width <= 390 ? 700 : 900 } })
    const errors = [], mutations = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) mutations.push(request.url()) })
    await page.goto(baseUrl)

    const ratio = page.getByRole('combobox', { name: 'Preview ratio' })
    const image = page.locator('[data-preview-ratio] img')
    const video = page.locator('[data-preview-ratio] video')
    const next = page.getByRole('button', { name: 'Next media' })
    await ratio.waitFor()
    assert.equal(await ratio.inputValue(), '4:5')
    assert.equal(await image.getAttribute('src'), '/portrait.jpg')
    await checkRatio(page, '4:5')
    await ratio.focus()
    await page.keyboard.press('ArrowDown')
    await checkRatio(page, '9:16')
    await next.click()
    assert.equal(await image.getAttribute('src'), '/landscape.jpg')
    await ratio.selectOption('1:1')
    await checkRatio(page, '1:1')
    assert.equal(await image.getAttribute('src'), '/landscape.jpg')
    await next.click()
    assert.equal(await image.getAttribute('src'), '/square.jpg')
    assert(await next.isDisabled(), 'the image cover appears only once')
    assert(await page.getByText(/Last line\.$/).evaluate(el => el.scrollHeight === el.clientHeight))
    const approve = page.getByRole('button', { name: '确认发布', exact: true })
    const approveBox = await approve.boundingBox()
    assert(approveBox && approveBox.y >= 0 && approveBox.y + approveBox.height <= page.viewportSize().height)
    assert.deepEqual(await page.evaluate(() => window.writes), [])
    await approve.click()
    assert.deepEqual(await page.evaluate(() => window.writes), [
      { operation: 'approve', draftId: 'images', mediaUrls: ['/landscape.jpg', '/portrait.jpg', '/square.jpg'], publishType: undefined },
    ])

    await page.evaluate(() => window.openPreview('quick', 'reel'))
    assert.equal(await ratio.inputValue(), '4:5')
    assert.equal(await video.getAttribute('poster'), '/portrait.jpg')
    assert.equal(await next.count(), 0)
    await video.evaluate(async el => {
      if (el.readyState < 1) await new Promise(resolve => el.addEventListener('loadedmetadata', resolve, { once: true }))
      await new Promise(resolve => {
        el.addEventListener('seeked', resolve, { once: true })
        el.currentTime = el.duration / 2
      })
    })
    const player = await video.elementHandle()
    const position = await video.evaluate(el => el.currentTime)
    await ratio.selectOption('9:16')
    await checkRatio(page, '9:16')
    assert.equal(await video.evaluate(el => el.currentTime), position, 'a ratio switch preserves the seek position')
    await video.evaluate(async el => { el.muted = true; el.loop = true; await el.play() })
    await ratio.selectOption('1:1')
    assert(await video.evaluate((el, previous) => el === previous && !el.paused, player))
    await page.evaluate(() => window.openPreview('quick', 'legacy'))
    assert.equal(await image.getAttribute('src'), '/landscape.jpg')
    await next.click()
    assert.equal(await video.getAttribute('src'), '/clip')
    await page.evaluate(() => window.openPreview('quick', 'empty'))
    await ratio.waitFor({ state: 'hidden' })

    await page.evaluate(() => window.openPreview('creation', 'mixed'))
    await checkRatio(page, '4:5')
    assert.equal(await image.getAttribute('src'), '/square.jpg')
    await next.click()
    assert.equal(await video.getAttribute('poster'), null, 'mixed carousels ignore standalone covers')
    await ratio.selectOption('9:16')
    await checkRatio(page, '9:16')
    assert.equal(await video.getAttribute('src'), '/clip')
    assert.equal(await page.locator('textarea').count(), 0, 'preview controls do not open the caption editor')
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    assert.deepEqual((await page.evaluate(() => window.writes)).at(-1), {
      operation: 'save', draftId: 'mixed', mediaUrls: ['/square.jpg', '/clip'], publishType: 'TIMELINE',
    })
    assert.deepEqual(mutations, [])
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`PASS Instagram review and creation preview ratios at ${width}px`)
  }
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
