'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, type MouseEvent } from 'react'
import { ExternalLink } from 'lucide-react'
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

export default function BrandFollowPanel({ brand, locale, themeColor }: { brand?: FollowBrand; locale: 'zh' | 'en'; themeColor?: string }) {
  const zh = locale === 'zh'
  const theme = brandEntryTheme(themeColor)
  const links = brandFollowLinks(brand)
  const accounts = links.filter(link => !link.review)
  const review = links.find(link => link.review)
  const reward = brand?.followRewardDescription?.trim()
  const pendingOpen = useRef<(() => void) | null>(null)
  useEffect(() => () => pendingOpen.current?.(), [])

  function openAccount(event: MouseEvent<HTMLAnchorElement>, platform: string, url: string) {
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

  return <section aria-labelledby="brand-follow-title" className="overflow-hidden rounded-[28px] border bg-white shadow-sm" style={{ borderColor: theme.border }}>
    <div className="px-5 py-4 text-center">
      <p className="text-xs font-bold tracking-[0.12em]" style={{ color: theme.ink }}>{zh ? '从这一面，到下一次见' : 'A little hello. A reason to stay in touch.'}</p>
      <h2 id="brand-follow-title" className="mt-2 text-2xl font-black leading-snug" style={{ color: theme.ink }}>{zh ? '成为我们的朋友吧！' : 'Let’s stay in touch!'}</h2>
      <p className="mt-2 text-sm leading-5 text-slate-600">{zh ? '店里的新鲜事、特别时刻，还有下一次见面的理由，都想分享给你。' : 'Good things, fresh stories, and little moments we’d love to share with you.'}</p>
    </div>
    <div className="px-4 py-4" style={{ background: theme.primary, color: theme.onPrimary }}>
      {reward && <div data-testid="follow-reward" className="mb-3 rounded-2xl px-4 py-3" style={{ background: theme.background, color: theme.ink }}>
        <p className="text-xs font-bold opacity-80">{zh ? '送给关注我们的你' : 'A little thank-you for following'}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm font-bold leading-6">{reward}</p>
      </div>}
      <p className="mb-3 text-center text-sm font-semibold opacity-90">{zh ? '轻点图标，就能找到我们' : 'Tap an icon to find us'}</p>
      {accounts.length ? <div className={`grid overflow-hidden rounded-3xl border p-2 ${accounts.length === 4 ? 'grid-cols-4 gap-1' : 'grid-cols-3'}`} style={{ background: theme.background, color: theme.ink, borderColor: theme.border, boxShadow: `0 8px 24px ${theme.ink}14` }}>
        {accounts.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
          onClick={event => openAccount(event, link.platform, link.url)}
          aria-label={`${labels[link.platform] || link.platform}${link.handle ? ` ${link.handle}` : ''}`}
          className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition group-hover:-translate-y-0.5 motion-reduce:transform-none"><PlatformMark platform={link.platform}/></span>
          <span className="w-full break-words text-[11px] font-bold leading-4">{labels[link.platform] || link.platform}</span>
          {link.handle && accounts.length !== 4 && <span className="w-full break-words text-[11px] leading-4 opacity-80">{link.handle}</span>}
        </a>)}
      </div> : <p className="text-center text-sm opacity-80">{zh ? '我们的社交账号即将与你见面。' : 'Our social pages will be here soon.'}</p>}
    </div>
    {review && <a href={review.url} target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-3 px-5 py-3 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-current">
      <img src="/social-platforms/google-original.jpg" alt="" className="h-7 w-7 shrink-0 rounded-lg" aria-hidden="true"/>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{zh ? '今天的体验，想听你说' : 'How was your visit?'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{zh ? '在 Google 留下你的真实评价' : 'Share your honest experience on Google'}</span></span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true"/>
    </a>}
  </section>
}
