'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, type MouseEvent } from 'react'
import { ExternalLink } from 'lucide-react'
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

export default function BrandFollowPanel({ brand, locale, themeColor, standalone = false, preview = false }: { brand?: FollowBrand; standalone?: boolean; preview?: boolean; locale: 'zh' | 'en'; themeColor?: string }) {
  const zh = locale === 'zh'
  const platformName = (platform: string) => !zh && platform === 'xiaohongshu' ? 'RedNote' : !zh && platform === 'wechat' ? 'WeChat' : labels[platform] || platform
  const theme = brandEntryTheme(themeColor)
  const links = brandFollowLinks(brand)
  const accounts = links.filter(link => !link.review)
  const review = links.find(link => link.review)
  const stickerLayout = accounts.length >= 2 && accounts.length <= 4
  const stickers = [
    { rotate: '-6deg', offset: '6px' },
    { rotate: '3deg', offset: '-3px' },
    { rotate: '-3deg', offset: '1px' },
    { rotate: '6deg', offset: '7px' },
  ]
  const reward = brand ? followRewardDescription(brand.followRewardDescription, locale) : ''
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
    let timer: number | undefined
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
    timer = window.setTimeout(() => {
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
      <p className="text-xs font-bold tracking-[0.12em]" style={{ color: theme.ink }}>{zh ? '从这一面，到下一次见' : 'A little hello. A reason to stay in touch.'}</p>
      <h2 id="brand-follow-title" className="mt-2 text-2xl font-black leading-snug" style={{ color: '#26313b' }}>{zh ? '成为我们的朋友吧！' : 'Let’s stay in touch!'}</h2>
      <p className="mt-2 text-sm leading-5 text-slate-600">{zh ? '店里的新鲜事、特别时刻，还有下一次见面的理由，都想分享给你。' : 'Good things, fresh stories, and little moments we’d love to share with you.'}</p>
    </div>
    <div className={`px-4 ${standalone ? 'flex flex-1 flex-col justify-center py-6' : 'py-4'}`} style={{ background: `linear-gradient(155deg, #fffdf8 0%, ${theme.background} 65%, ${theme.tint} 100%)`, color: theme.ink, borderTop: `1px dashed ${theme.border}` }}>
      {reward && <div data-testid="follow-reward" className="mb-3 rounded-2xl px-4 py-3" style={{ background: '#ffffff', color: theme.ink, border: `1px solid ${theme.border}` }}>
        <p className="text-xs font-bold opacity-80">{zh ? '送给关注我们的你' : 'A little thank-you for following'}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6">{reward}</p>
      </div>}
      <p className="mb-3 text-center text-sm font-semibold opacity-90">{zh ? '轻点图标，就能找到我们' : 'Tap an icon to find us'}</p>
      {accounts.length ? <div className={`relative grid ${stickerLayout ? `${accounts.length === 2 ? 'grid-cols-2' : accounts.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-3 px-1 pb-3 pt-3` : 'grid-cols-3 gap-2 rounded-3xl border p-2'}`} style={stickerLayout ? undefined : { background: theme.background, color: theme.ink, borderColor: theme.border }}>
        {accounts.map((link, index) => <a key={link.url} data-preview-account-link="true" href={link.url} target="_blank" rel="noopener noreferrer"
          onClick={event => openAccount(event, link.platform, link.url)}
          aria-label={`${platformName(link.platform)}${link.handle ? ` ${link.handle}` : ''}`}
          className={`group relative flex min-w-0 flex-col items-center gap-2 px-1 py-3 text-center transition hover:z-10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current ${stickerLayout ? 'rounded-xl border border-white/70' : 'rounded-2xl hover:bg-black/5'}`}
          style={stickerLayout ? {
            background: '#ffffff', color: '#334155', outlineColor: theme.ink,
            transform: `translateY(${stickers[index].offset}) rotate(${accounts.length === 3 ? ['-4deg', '2deg', '-3deg'][index] : stickers[index].rotate})`,
            boxShadow: `0 3px 0 ${theme.border}66, 0 8px 18px ${theme.ink}12`,
          } : undefined}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl transition group-hover:-translate-y-0.5 motion-reduce:transform-none"><PlatformMark platform={link.platform}/></span>
          <span className="w-full break-words text-[11px] font-bold leading-4">{platformName(link.platform)}</span>
          {link.handle && accounts.length !== 4 && <span className="w-full break-words text-[11px] leading-4 opacity-80">{link.handle}</span>}
        </a>)}
      </div> : <p className="text-center text-sm opacity-80">{zh ? '我们的社交账号即将与你见面。' : 'Our social pages will be here soon.'}</p>}
    </div>
    {review && <a data-preview-account-link="true" href={review.url} target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-3 px-5 py-3 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-current">
      <img src="/social-platforms/google-original.jpg" alt="" className="h-7 w-7 shrink-0 rounded-lg" aria-hidden="true"/>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{zh ? '今天的体验，想听你说' : 'How was your visit?'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{zh ? '在 Google 留下你的真实评价' : 'Share your honest experience on Google'}</span></span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true"/>
    </a>}
  </section>
}
