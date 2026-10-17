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
  return asset ? <img src={`/social-platforms/${asset}-original.jpg`} alt="" className="h-14 w-14 rounded-2xl object-contain" aria-hidden="true"/> : <span className="text-xs font-bold">{labels[platform] || platform}</span>
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

  return <section aria-labelledby="brand-follow-title" className="overflow-hidden rounded-[28px] border bg-white shadow-lg shadow-slate-900/5" style={{ borderColor: theme.border }}>
    <header className="relative overflow-hidden px-5 pb-6 pt-7 text-center" style={{ background: `linear-gradient(145deg, ${theme.tint}, ${theme.background} 75%)` }}>
      <span aria-hidden="true" className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[20px] opacity-20" style={{ borderColor: theme.primary }}/>
      <p className="relative mx-auto inline-block max-w-full break-words rounded-full border bg-white/70 px-4 py-1.5 text-sm font-bold" style={{ color: theme.ink, borderColor: theme.border }}>{brand?.name || 'AMC'}</p>
      <h1 id="brand-follow-title" className="relative mt-5 text-2xl font-black leading-snug" style={{ color: theme.ink }}>{zh ? '嗨，很高兴见到你！' : 'Hi, lovely to see you!'}</h1>
      <p className="relative mt-3 text-sm leading-6 text-slate-600"><span className="block font-bold" style={{ color: theme.ink }}>{zh ? '成为我们的朋友吧' : 'Let’s be friends.'}</span>{zh ? '店里的新鲜事，想第一时间分享给你。' : 'We’d love to share our latest stories with you.'}</p>
    </header>
    <div className="px-5 pb-4">
    {reward && <div data-testid="follow-reward" className="relative mt-4 rounded-2xl border border-dashed px-4 py-3" style={{ background: theme.background, borderColor: theme.border, color: theme.ink }}>
      <p className="text-[11px] font-bold tracking-wide opacity-80">{zh ? '关注小礼遇' : 'A little thank-you'}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6">{reward}</p>
    </div>}
    {accounts.length ? <div className={`mt-6 grid gap-x-2 gap-y-5 ${accounts.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>{accounts.map(link => <a
      key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
      onClick={event => openAccount(event, link.platform, link.url)}
      aria-label={`${labels[link.platform] || link.platform}${link.handle ? ` ${link.handle}` : ''}`}
      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      style={{ color: theme.ink }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition group-hover:-translate-y-0.5 motion-reduce:transform-none"><PlatformMark platform={link.platform}/></span>
      <span className="w-full break-words text-xs font-bold text-slate-800">{labels[link.platform] || link.platform}</span>
      {link.handle && <span className="w-full break-words text-[11px] leading-4 text-slate-500">{link.handle}</span>}
    </a>)}</div> : <p className="mt-4 text-center text-sm text-slate-500">{zh ? '社交账号待补充。' : 'Social accounts will be added here.'}</p>}
    {review && <a href={review.url} target="_blank" rel="noopener noreferrer" className="mt-5 flex min-h-12 items-center justify-center gap-2 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
      <img src="/social-platforms/google-original.jpg" alt="" className="h-6 w-6 rounded-md" aria-hidden="true"/>
      <span>{zh ? '留下真实评价' : 'Leave an honest review'}</span>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true"/>
    </a>}
    </div>
  </section>
}
