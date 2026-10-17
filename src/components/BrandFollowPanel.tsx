'use client'
/* eslint-disable @next/next/no-img-element */

import { Fragment, useContext, useEffect, useRef, useState, type MouseEvent } from 'react'
import { ActivityCanvasEditing, ActivityInlineText, ActivityInlineLinkEditor } from '@/components/ActivityCanvasEditor'
import { activityText } from '@/lib/activityPage'
import { ChevronRight, Share2 } from 'lucide-react'
import { activitySharePresentation } from '@/lib/activitySharePresentation'
import { shareActivityPage } from '@/lib/activityShare'
import { followRewardDescription } from '@/lib/followReward'
import { brandEntryTheme } from '@/lib/brandEntryTheme'
import { brandFollowLinks, followAppUrl, type FollowBrand } from '@/lib/brandFollowLinks'

const labels: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube',
  xiaohongshu: '小红书', google: 'Google', google_maps: 'Google Maps', google_business: 'Google Maps', linkedin: 'LinkedIn', twitter: 'X', x: 'X', wechat: '微信',
}

function PlatformMark({ platform }: { platform: string }) {
  const assets: Record<string, string> = {
    instagram: 'instagram', tiktok: 'tiktok', facebook: 'facebook', xiaohongshu: 'xiaohongshu',
    youtube: 'youtube', linkedin: 'linkedin', x: 'x', twitter: 'x', wechat: 'wechat',
    google: 'google', google_business: 'google', google_maps: 'google', rednote: 'xiaohongshu',
  }
  const asset = assets[platform]
  return asset ? <img src={`/social-platforms/${asset}-original.jpg`} alt="" className="h-full w-full rounded-2xl object-contain" aria-hidden="true"/> : <span className="text-xs font-bold">{labels[platform] || platform}</span>
}

export default function BrandFollowPanel({ brandId, brand, shareBrand, locale, themeColor, standalone = false, preview = false }: { brandId: string; brand?: FollowBrand; shareBrand?: FollowBrand; standalone?: boolean; preview?: boolean; locale: 'zh' | 'en'; themeColor?: string }) {
  const zh = locale === 'zh'
  const editing = useContext(ActivityCanvasEditing).enabled
  const text = (key: Parameters<typeof activityText>[1]) => activityText(brand?.activityPage, key, locale)
  const platformName = (platform: string) => !zh && platform === 'xiaohongshu' ? 'RedNote' : !zh && platform === 'wechat' ? 'WeChat' : labels[platform] || platform
  const theme = brandEntryTheme(themeColor)
  const links = brandFollowLinks(brand)
  const accounts = links.filter(link => !link.review)
  const stickerLayout = accounts.length >= 2 && accounts.length <= 4
  const stickers = [
    { rotate: '-6deg', offset: '6px' },
    { rotate: '3deg', offset: '-3px' },
    { rotate: '-3deg', offset: '1px' },
    { rotate: '6deg', offset: '7px' },
  ]
  const rewardEnabled = brand ? followRewardDescription(brand.followRewardDescription, locale) : ''
  const reward = rewardEnabled ? activityText(brand?.activityPage, 'reward', locale, brand?.followRewardDescription) : ''
  const [shareNotice, setShareNotice] = useState('')
  const pendingOpen = useRef<(() => void) | null>(null)
  useEffect(() => () => pendingOpen.current?.(), [])

  function openAccount(event: MouseEvent<HTMLAnchorElement>, platform: string, url: string) {
    if (preview) return // Keep preview links in a new tab; never navigate the editor iframe.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return
    const appUrl = followAppUrl(platform, url)
    if (!appUrl) return // Universal links are handled directly by the OS.
    event.preventDefault()
    pendingOpen.current?.()
    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', cancel)
      pendingOpen.current = null
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') cancel() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', cancel)
    pendingOpen.current = cancel
    const timer = window.setTimeout(() => {
      cancel()
      window.location.assign(url)
    }, 900)
    try { window.location.assign(appUrl) } catch {
      cancel()
      window.location.assign(url)
    }
  }

  return <section aria-labelledby="brand-follow-title" className="flex flex-col overflow-hidden rounded-[28px] border bg-white shadow-sm" style={{ borderColor: theme.border, minHeight: standalone ? 'clamp(360px, calc(80svh - 160px), 600px)' : undefined }}>
    <div className={`px-5 text-center ${standalone ? 'py-6' : 'py-4'}`}>
      <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-9 rounded-full" style={{ background: theme.primary }} />
      <ActivityInlineText as="p" field="eyebrow" className="text-xs font-bold tracking-[0.12em]" style={{ color: theme.ink }}>{text('eyebrow')}</ActivityInlineText>
      <ActivityInlineText as="h2" field="followTitle" id="brand-follow-title" className="mt-2 text-2xl font-black leading-snug" style={{ color: '#26313b' }}>{text('followTitle')}</ActivityInlineText>
      <ActivityInlineText as="p" field="followNote" className="mt-2 text-sm leading-5 text-slate-600">{text('followNote')}</ActivityInlineText>
    </div>
    <div className={`px-4 ${standalone ? 'flex flex-1 flex-col justify-center py-6' : 'py-4'}`} style={{ background: `linear-gradient(155deg, #fffdf8 0%, ${theme.background} 65%, ${theme.tint} 100%)`, color: theme.ink, borderTop: `1px dashed ${theme.border}` }}>
      {(reward || editing) && <div data-testid="follow-reward" className="mb-3 rounded-2xl px-4 py-3" style={{ background: '#ffffff', color: theme.ink, border: `1px solid ${theme.border}` }}>
        <ActivityInlineText as="p" field="rewardTitle" className="text-xs font-bold opacity-80">{text('rewardTitle')}</ActivityInlineText>
        <ActivityInlineText as="p" field="reward" className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6">{reward}</ActivityInlineText>
      </div>}
      <ActivityInlineText as="p" field="tapHint" className="mb-3 text-center text-sm font-semibold opacity-90">{text('tapHint')}</ActivityInlineText>
      {accounts.length ? <div className={`relative grid ${stickerLayout ? `${accounts.length === 2 ? 'grid-cols-2' : accounts.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-3 px-1 pb-3 pt-3` : 'grid-cols-3 gap-2 rounded-3xl border p-2'}`} style={stickerLayout ? undefined : { background: theme.background, color: theme.ink, borderColor: theme.border }}>
        {accounts.map((link, index) => <Fragment key={link.key}><a data-preview-account-link="true" data-activity-edit="link" data-link-key={link.key} data-link-original={link.originalUrl} href={link.url} target="_blank" rel="noopener noreferrer"
          onClick={event => openAccount(event, link.platform, link.url)}
          aria-label={`${link.mapSearch ? (zh ? '地图搜索' : 'Find on Maps') : platformName(link.platform)}${link.handle ? ` ${link.handle}` : ''}`}
          className={`group relative flex min-w-0 flex-col items-center gap-2 px-1 py-3 text-center transition hover:z-10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current ${stickerLayout ? 'rounded-xl border border-white/70' : 'rounded-2xl hover:bg-black/5'}`}
          style={stickerLayout ? {
            background: '#ffffff', color: '#334155', outlineColor: theme.ink,
            transform: `translateY(${stickers[index].offset}) rotate(${accounts.length === 3 ? ['-4deg', '2deg', '-3deg'][index] : stickers[index].rotate})`,
            boxShadow: `0 3px 0 ${theme.border}66, 0 8px 18px ${theme.ink}12`,
          } : undefined}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl transition group-hover:-translate-y-0.5 motion-reduce:transform-none"><PlatformMark platform={link.platform}/></span>
          <span className="w-full break-words text-[11px] font-bold leading-4">{link.mapSearch ? (zh ? '地图搜索' : 'Find on Maps') : platformName(link.platform)}</span>
          {link.handle && accounts.length !== 4 && <span className="w-full break-words text-[11px] leading-4 opacity-80">{link.handle}</span>}
        </a>{((index + 1) % (stickerLayout ? accounts.length : 3) === 0 || index === accounts.length - 1) && accounts.slice(index - index % (stickerLayout ? accounts.length : 3), index + 1).map(rowLink => <ActivityInlineLinkEditor key={rowLink.key} linkKey={rowLink.key}/>)}</Fragment>)}
      </div> : <p className="text-center text-sm opacity-80">{zh ? '我们的社交账号即将与你见面。' : 'Our social pages will be here soon.'}</p>}
    </div>
    <button type="button" data-activity-share onClick={async () => {
      setShareNotice('')
      const savedBrand = shareBrand || brand
      const copy = activitySharePresentation(savedBrand?.name || '', savedBrand?.activityPage, locale)
      const result = await shareActivityPage(brandId, copy.title, copy.description, navigator)
      if (result === 'copied') setShareNotice('copied')
      if (result === 'failed') setShareNotice('failed')
    }} className="flex min-h-16 w-full items-center gap-3 px-5 py-4 text-left text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-current">
      <Share2 className="h-6 w-6 shrink-0" aria-hidden="true"/>
      <span className="min-w-0 flex-1"><ActivityInlineText as="span" field="shareTitle" className="block text-sm font-bold">{text('shareTitle')}</ActivityInlineText><ActivityInlineText as="span" field="shareNote" className="mt-1 block text-xs leading-5 text-slate-500">{text('shareNote')}</ActivityInlineText></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true"/>
    </button>
    {shareNotice && <p role="status" className="px-5 pb-3 text-xs text-slate-600">{shareNotice === 'copied' ? (zh ? '店铺链接已复制，可以发给朋友啦。' : 'Link copied. Send it to a friend!') : (zh ? '暂时无法分享，请复制浏览器地址发给朋友。' : 'Unable to share. Copy the page address to send to a friend.')}</p>}

  </section>
}
