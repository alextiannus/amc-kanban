'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Check, Copy, Download, ExternalLink, Save, Share2 } from 'lucide-react'
import { followRewardDescription as resolveFollowRewardDescription } from '@/lib/followReward'
import { activityTextDefaults, activitySourceText, activityPageDraftSnapshot, activityTranslationTasks, isActivitySourceLink, normalizeActivityPage, type ActivityPage } from '@/lib/activityPage'
import { BRAND_ACCOUNTS_CHANGED } from '@/lib/brandAccountEvents'
import { activityPrimary, activitySecondary } from './activityUi'
import { getPermanentGameUrl } from '@/lib/gameQr'
import { AMC_QR_LOGO, drawAmcQrBackground } from '@/lib/amcQrArtwork'

export default function FollowEntryCard({ brandId, brandName, qrCodeUrl, isEn = false, rewardDescription, onRewardChange, onRewardSaved, activityVersion = 0, previewConfig, previewActivity = false, onDrawSelection, onEditDraw, onPageDirtyChange, children }: {
  brandId: string; brandName: string; qrCodeUrl: string; isEn?: boolean
  rewardDescription: string; onRewardChange: (value: string) => void; onRewardSaved?: (value: string) => void; activityVersion?: number; previewConfig?: Record<string, unknown>; previewActivity?: boolean; onDrawSelection?: (enabled: boolean) => void; onEditDraw?: () => void; onPageDirtyChange?: (dirty: boolean) => void; children?: ReactNode
}) {
  const previewFrame = useRef<HTMLIFrameElement>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [page, setPage] = useState<ActivityPage>({ text: {}, links: {} })
  const [revision, setRevision] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingPage, setSavingPage] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const dirty = Boolean(savedSnapshot) && activityPageDraftSnapshot(page, rewardDescription) !== savedSnapshot
  useEffect(() => { onPageDirtyChange?.(dirty) }, [dirty, onPageDirtyChange])
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch(`/api/brands/${encodeURIComponent(brandId)}/activity-page`, { cache: 'no-store', signal: controller.signal })
        if (!res.ok) throw new Error('Unable to load page')
        const data = await res.json()
        if (controller.signal.aborted) return
        const next = normalizeActivityPage(data.activityPage)
        setPage(next)
        setRevision(data.revision)
        const reward = resolveFollowRewardDescription(data.followRewardDescription)
        onRewardChange(reward)
        onRewardSaved?.(reward)
        setSavedSnapshot(activityPageDraftSnapshot(next, reward))
        onDrawSelection?.(next.drawEnabled ?? previewActivity)
        setError('')
      } catch { if (!controller.signal.aborted) setError(isEn ? 'Unable to load this page. Try reloading.' : '页面载入失败，请重新载入。') }
    })()
    return () => controller.abort()
    // A brand switch remounts this workspace; never replace a live draft on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, loadVersion])
  const sendPreview = useCallback(() => {
    previewFrame.current?.contentWindow?.postMessage({ type: 'AMC_GAME_PREVIEW_UPDATE', brandId, config: previewConfig, rewardDescription, previewActivity: page.drawEnabled ?? previewActivity, activityPage: page, editing: Boolean(revision) && !savingPage }, new URL(getPermanentGameUrl(brandId)).origin)
  }, [brandId, previewConfig, rewardDescription, previewActivity, page, revision, savingPage])
  useEffect(() => {
    sendPreview()
    const receive = (event: MessageEvent) => {
      if (event.origin !== new URL(getPermanentGameUrl(brandId)).origin || event.source !== previewFrame.current?.contentWindow || event.data?.brandId !== brandId) return
      if (event.data.type === 'AMC_GAME_PREVIEW_READY') sendPreview()
      const data = event.data
      if (!revision || savingPage) return
      if (data.type === 'AMC_GAME_PREVIEW_EDIT' && data.field === 'draw') { onEditDraw?.(); return }
      if (data.type === 'AMC_GAME_PREVIEW_INLINE_CHANGE') {
        const messageLocale: unknown = data.locale
        if (messageLocale !== 'zh' && messageLocale !== 'en') return
        if (data.field === 'link' && typeof data.linkKey === 'string' && isActivitySourceLink(data.linkKey, 'https://example.test/') && (data.value === null || (typeof data.value === 'string' && data.value.length <= 2048))) {
          setPage(current => {
            const links = { ...current.links }
            if (data.value === null) delete links[data.linkKey]
            else links[data.linkKey] = data.value
            return { ...current, links }
          })
        } else if (typeof data.value === 'string' && data.value.length <= 500) {
          if (data.field === 'reward') {
            onRewardChange(data.value)
            setPage(current => {
              const text = { ...current.text, [messageLocale]: { ...current.text[messageLocale], reward: data.value } }
              const sourceLocale = /[\u3400-\u9fff]/u.test(rewardDescription) ? 'zh' : 'en'
              const other = messageLocale === 'zh' ? 'en' : 'zh'
              const original = activitySourceText(current, 'reward', other, rewardDescription)
              if (messageLocale !== sourceLocale && original !== undefined && text[other]?.reward === undefined) text[other] = { ...text[other], reward: original }
              return { ...current, text }
            })
          }
          else if (typeof data.field === 'string' && Object.hasOwn(activityTextDefaults, data.field)) {
            setPage(current => ({ ...current, text: { ...current.text, [messageLocale]: { ...current.text[messageLocale], [data.field]: data.value } } }))
          }
        }
        setNotice('')
      }

    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [brandId, sendPreview, onEditDraw, onRewardChange, revision, savingPage, rewardDescription])
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ brandId: string }>).detail?.brandId !== brandId) return
      previewFrame.current?.contentWindow?.postMessage({ type: 'AMC_GAME_PREVIEW_REFRESH_ACCOUNTS', brandId }, new URL(getPermanentGameUrl(brandId)).origin)
    }
    window.addEventListener(BRAND_ACCOUNTS_CHANGED, refresh)
    return () => window.removeEventListener(BRAND_ACCOUNTS_CHANGED, refresh)
  }, [brandId])
  const [translationPending, setTranslationPending] = useState(false)
  useEffect(() => {
    if (!revision || savingPage || !activityTranslationTasks(page, rewardDescription).length) return
    const controller = new AbortController()
    const snapshot = activityPageDraftSnapshot(page, rewardDescription)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/activity-page`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ activityPage: page, followRewardDescription: rewardDescription }) })
        if (!response.ok) return
        const data = await response.json()
        if (controller.signal.aborted) return
        setTranslationPending(data.translationPending === true)
        setPage(current => activityPageDraftSnapshot(current, rewardDescription) === snapshot && JSON.stringify(current) !== JSON.stringify(data.activityPage) ? normalizeActivityPage(data.activityPage) : current)
      } catch { /* A draft translation failure must not erase edits. */ }
    }, 700)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [brandId, page, rewardDescription, revision, savingPage])
  async function savePage() {
    setSavingPage(true); setError(''); setNotice('')
    try {
      const validated = normalizeActivityPage(page)
      const res = await fetch(`/api/brands/${encodeURIComponent(brandId)}/activity-page`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activityPage: validated, followRewardDescription: rewardDescription, revision }) })
      if (res.status === 409) throw new Error(isEn ? 'Someone updated this page. Reload before saving.' : '页面已被更新，请重新载入后再保存。')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.code === 'DRAW_NOT_CONFIGURED') throw new Error(isEn ? 'Save draw prizes first, then save this page.' : '请先配置并保存轮盘奖品，再保存活动页。')
        throw new Error(isEn ? 'Unable to save this page.' : '保存失败，请检查链接后重试。')
      }
      const data = await res.json()
      if (!mounted.current) return
      setPage(data.activityPage); setRevision(data.revision)
      onRewardChange(data.followRewardDescription); onRewardSaved?.(data.followRewardDescription)
      setSavedSnapshot(activityPageDraftSnapshot(data.activityPage, data.followRewardDescription))
      setTranslationPending(data.translationPending === true)
      setNotice(isEn ? 'Page saved. Visitors will see your changes.' : '页面已保存，顾客可看到更新。')
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed') }
    finally { setSavingPage(false) }
  }
  async function sharePage() {
    setError(''); setNotice('')
    try {
      if (navigator.share) await navigator.share({ title: brandName, url: getPermanentGameUrl(brandId) })
      else { await navigator.clipboard.writeText(getPermanentGameUrl(brandId)); setNotice(isEn ? 'Page link copied.' : '页面链接已复制。') }
    } catch (err) { if (err instanceof Error && err.name === 'AbortError') return
      try { await navigator.clipboard.writeText(getPermanentGameUrl(brandId)); setNotice(isEn ? 'Page link copied. Share it anywhere.' : '页面链接已复制，可粘贴分享。') }
      catch { setError(isEn ? 'Unable to share. Open the published page and copy its address.' : '分享失败，请打开已发布页面复制地址。') } }
  }
  const invitation = { zh: '扫一扫，成为我们的朋友吧', en: 'Scan to stay in touch', zhNote: '店里的新鲜事，想继续分享给你。', enNote: 'A little more of our world, shared with you.' }
  const title = isEn ? 'Scan to stay in touch' : '扫一扫，成为我们的朋友吧'
  const url = getPermanentGameUrl(brandId)

  const [googleSync, setGoogleSync] = useState<{ brandId: string; status: string; lastError?: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let reading = false
    const read = async () => {
      if (reading) return
      reading = true
      try {
        const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/google-map`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const receipt = await response.json()
        if (!controller.signal.aborted && receipt.brandId === brandId) setGoogleSync({ brandId: receipt.brandId, status: receipt.ready ? 'MAP_READY' : receipt.googleSync?.status, lastError: receipt.ready ? undefined : receipt.googleSync?.lastError })
      } catch { /* Keep the preview usable when the private status endpoint is unavailable. */ }
      finally { reading = false }
    }
    void read()
    const timer = window.setInterval(() => void read(), 30_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [brandId, activityVersion])

  async function exportCard(print: boolean, qrOnly = false) {
    // Open synchronously so browser popup protection does not block printing.
    const popup = print ? window.open('', '_blank', 'width=800,height=900') : null
    if (print && !popup) {
      setError(isEn ? 'Allow popups to print this card.' : '请允许弹出窗口后重试打印。')
      return
    }
    if (popup) popup.opener = null
    setBusy(true)
    setError('')
    try {
      const qr = new Image()
      qr.src = qrCodeUrl
      const logo = new Image()
      logo.src = AMC_QR_LOGO
      await Promise.all([qr.decode(), logo.decode(), document.fonts.ready])
      const canvas = document.createElement('canvas')
      canvas.width = qrOnly ? 900 : 1200
      canvas.height = qrOnly ? 1200 : 1700
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      drawAmcQrBackground(ctx, canvas.width, canvas.height)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#132523'
      ctx.font = qrOnly ? '700 30px sans-serif' : '700 40px sans-serif'
      ctx.fillText(brandName, canvas.width / 2, qrOnly ? 75 : 125, canvas.width - 160)
      ctx.font = qrOnly ? '800 38px sans-serif' : '800 52px sans-serif'
      ctx.fillText(invitation.zh, canvas.width / 2, qrOnly ? 145 : 230, canvas.width - 160)
      ctx.font = qrOnly ? '700 30px sans-serif' : '700 40px sans-serif'
      ctx.fillText(invitation.en, canvas.width / 2, qrOnly ? 195 : 295, canvas.width - 160)
      ctx.fillStyle = '#60706d'
      ctx.font = qrOnly ? '25px sans-serif' : '30px sans-serif'
      ctx.fillText(invitation.zhNote, canvas.width / 2, qrOnly ? 245 : 360, canvas.width - 160)
      ctx.font = qrOnly ? '22px sans-serif' : '28px sans-serif'
      ctx.fillText(invitation.enNote, canvas.width / 2, qrOnly ? 280 : 410, canvas.width - 160)
      // The artwork stays outside this white plate and the QR's quiet zone.
      const plate = qrOnly ? { x: 90, y: 330, size: 720, qr: 640 } : { x: 200, y: 555, size: 800, qr: 720 }
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(plate.x, plate.y, plate.size, plate.size, 28)
      ctx.fill()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(qr, plate.x + 40, plate.y + 40, plate.qr, plate.qr)
      ctx.fillStyle = '#60706d'
      if (!qrOnly) {
        ctx.font = '28px sans-serif'
        ctx.fillText('扫码进入品牌主页', 600, 1430, 1040)
        ctx.font = '24px sans-serif'
        ctx.fillText('Scan to explore our social pages', 600, 1475, 1040)
      }
      const footerSize = qrOnly ? 20 : 24
      ctx.font = `${footerSize}px sans-serif`
      ctx.textAlign = 'left'
      const prefix = 'Powered by'
      const suffix = 'AMC - AI Marketing Crew'
      const gap = footerSize * .4
      const logoSize = footerSize * 1.15
      const prefixWidth = ctx.measureText(prefix).width
      const footerWidth = prefixWidth + gap + logoSize + gap + ctx.measureText(suffix).width
      const footerX = (canvas.width - footerWidth) / 2
      const footerY = qrOnly ? 1140 : 1610
      ctx.fillText(prefix, footerX, footerY)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(logo, footerX + prefixWidth + gap, footerY - footerSize * .9, logoSize, logoSize)
      ctx.fillText(suffix, footerX + prefixWidth + gap + logoSize + gap, footerY)
      const image = canvas.toDataURL('image/png')
      if (popup) {
        const doc = popup.document
        doc.title = title
        const style = doc.createElement('style')
        style.textContent = '@page{size:A5 portrait;margin:0}body{margin:0;text-align:center}img{display:block;width:100%;max-height:100vh;object-fit:contain}@media print{img{width:148mm;height:210mm;max-height:none}}'
        doc.head.append(style)
        const output = doc.createElement('img')
        output.alt = title
        output.src = image
        doc.body.append(output)
        await output.decode()
        popup.focus()
        popup.print()
      } else {
        const anchor = document.createElement('a')
        anchor.download = `${qrOnly ? 'brand-qr' : 'brand-follow'}-${brandId}.png`
        anchor.href = image
        anchor.click()
      }
    } catch {
      popup?.close()
      setError(isEn ? 'Unable to export. Please try again.' : '卡片导出失败，请重试。')
    } finally { setBusy(false) }
  }

  return <section className="space-y-4 text-slate-900 dark:text-slate-100" aria-label={isEn ? 'Activity page builder' : '活动页编辑器'}>
    <fieldset disabled={!revision || savingPage} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <legend className="sr-only">{isEn ? 'Choose activities' : '选择活动'}</legend>
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{isEn ? 'Choose activities' : '选择活动'}</h3><span className="text-xs text-slate-500">{isEn ? 'One page · One QR code' : '一张活动页 · 一个二维码'}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 p-3 text-left text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100"><Check size={18}/><span><strong className="block text-sm">{isEn ? 'Follow & review' : '关注评价'}</strong><span className="mt-1 block text-xs opacity-70">{isEn ? 'Included · Linked accounts appear automatically' : '默认加入 · 自动展示已绑定账号'}</span></span></div>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${page.drawEnabled ?? previewActivity ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100' : 'border-slate-200 dark:border-slate-700'}`}>
          <input type="checkbox" checked={page.drawEnabled ?? previewActivity} onChange={event => { const checked = event.target.checked; setPage(current => ({ ...current, drawEnabled: checked })); onDrawSelection?.(checked); }} className="h-4 w-4 accent-blue-600"/>
          <span><strong className="block text-sm">{isEn ? 'Share & spin' : '分享抽奖轮盘'}</strong><span className="mt-1 block text-xs text-slate-500">{isEn ? 'Add sharing tasks and prizes' : '添加分享任务与抽奖礼品'}</span></span>
        </label>
      </div>
    </fieldset>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-sm font-bold">{isEn ? 'Activity page canvas' : '活动页预览编辑框'}</h3><p className="mt-1 text-xs text-slate-500">{isEn ? 'Edit text directly. Tap an icon to edit and test its link.' : '直接修改文字，点击图标可编辑并测试链接。'}</p></div>
      </div>
      <div className="space-y-4">
        <div id="activity-preview-panel" className="min-w-0">
          {googleSync?.brandId === brandId && (googleSync.status === 'WAITING_FOR_LOCATIONS' || googleSync.lastError === 'GOOGLE_LOCATIONS_PENDING_SYNC' || googleSync.lastError === 'GOOGLE_LOCATION_SELECTION_REQUIRED') && <p role="status" data-testid="google-location-notice" className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{isEn ? 'Google location details are still being synchronized.' : 'Google 门店资料仍在同步中。'}</p>}
          <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <iframe ref={previewFrame} onLoad={sendPreview} key={`${brandId}-${activityVersion}`} src={`${url}?preview=1&revision=${activityVersion}`} title={isEn ? 'Customer activity page preview' : '顾客活动页预览'} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin" className="block h-[min(76svh,840px)] min-h-[480px] w-full border-0"/>
          </div>
        </div>
        <aside id="activity-edit-panel" className="min-w-0 space-y-3">
          {children}
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button type="button" className={activitySecondary} disabled={!qrCodeUrl || busy} onClick={() => void exportCard(false)}><Download size={14}/>{isEn ? 'Download QR sticker' : '下载二维码贴纸'}</button>
        <button type="button" className={activitySecondary} onClick={() => void sharePage()}><Share2 size={14}/>{isEn ? 'Share page' : '分享页面'}</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={activitySecondary}><ExternalLink size={14}/>{isEn ? 'Open published page' : '打开已发布页面'}</a>
        <button type="button" className={activitySecondary} onClick={() => void navigator.clipboard.writeText(url).then(() => setNotice(isEn ? 'Link copied.' : '链接已复制。')).catch(() => setError(isEn ? 'Unable to copy link.' : '复制失败。'))}><Copy size={14}/>{isEn ? 'Copy link' : '复制链接'}</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{dirty ? (isEn ? 'Draft changes are not included in shared pages until saved.' : '分享与二维码打开已保存页面，草稿需保存后生效。') : (isEn ? 'Permanent QR code. Update this page without reprinting.' : '固定二维码，更新活动页后无需重新打印。')}</p>
    </div>
    <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <p role={error ? 'alert' : 'status'} className={`min-w-0 flex-1 text-xs leading-5 ${error ? 'text-red-600' : 'text-slate-500'}`}>{error || (translationPending && activityTranslationTasks(page, rewardDescription).length > 0 ? (isEn ? 'Some text is awaiting translation. Your draft is safe.' : '部分文案暂未完成翻译，草稿已保留。') : dirty ? (isEn ? 'Unsaved page changes' : '页面有未保存的修改') : notice || (isEn ? 'Page is up to date' : '页面已是最新'))}</p>
      <button type="button" disabled={savingPage} className={activitySecondary} onClick={() => { if (!dirty || window.confirm(isEn ? 'Discard unsaved page changes?' : '放弃尚未保存的页面修改？')) { setRevision(''); setLoadVersion(v => v + 1) } }}>{isEn ? 'Reload page' : '重新载入'}</button>
      <button type="button" disabled={!revision || savingPage || !dirty} onClick={() => void savePage()} className={activityPrimary}><Save size={14}/>{savingPage ? (isEn ? 'Saving…' : '保存中…') : (isEn ? 'Save page' : '保存页面')}</button>
    </div>
  </section>
}
