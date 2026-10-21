'use client'

/**
 * platformUtils.tsx
 * ──────────────────────────────────────────────────────
 * Shared platform logo SVGs and helper utilities.
 * Used by BrandOwnerDashboard, CalendarSubPage, DraftPreviewCards, etc.
 */
import React from 'react'

// ─── Normalise platform string ────────────────────────
export function normalizePlatform(platform: string): string {
  const key = (platform || '').trim().toLowerCase()
  const map: Record<string, string> = {
    instagram: 'instagram', ig: 'instagram', ins: 'instagram',
    xiaohongshu: 'xiaohongshu', rednote: 'xiaohongshu', red: 'xiaohongshu', xhs: 'xiaohongshu', redbook: 'xiaohongshu',
    tiktok: 'tiktok',
    facebook: 'facebook', fb: 'facebook',
    google: 'google', google_business: 'google', google_maps: 'google',
    wechat: 'wechat', weixin: 'wechat',
  }
  return map[key] ?? key
}

// ─── Platform SVG logo inline components ─────────────────────────────────────
export const PlatformLogo: Record<string, React.FC<{ className?: string }>> = {
  instagram: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFDC80"/>
          <stop offset="25%" stopColor="#FCAF45"/>
          <stop offset="50%" stopColor="#F77737"/>
          <stop offset="75%" stopColor="#F56040"/>
          <stop offset="100%" stopColor="#833AB4"/>
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)"/>
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  ),
  xiaohongshu: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#FF2442"/>
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="serif">小</text>
    </svg>
  ),
  tiktok: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#010101"/>
      <path d="M17 8.5c-1.2 0-2.2-.7-2.7-1.8V16c0 2-1.6 3.5-3.5 3.5S7.3 18 7.3 16s1.6-3.5 3.5-3.5c.2 0 .5 0 .7.1v-2.5c-.2 0-.5-.1-.7-.1-3.1 0-5.6 2.5-5.6 5.5S7.7 21 10.8 21s5.5-2.5 5.5-5.5V9.7c.8.5 1.8.8 2.7.8V8.5z" fill="#EE1D52"/>
      <path d="M17 8.5c-1.2 0-2.2-.7-2.7-1.8V16c0 2-1.6 3.5-3.5 3.5S7.3 18 7.3 16s1.6-3.5 3.5-3.5c.2 0 .5 0 .7.1v-2.5c-.2 0-.5-.1-.7-.1-3.1 0-5.6 2.5-5.6 5.5S7.7 21 10.8 21s5.5-2.5 5.5-5.5V9.7c.8.5 1.8.8 2.7.8V8.5z" fill="white" opacity="0.9"/>
    </svg>
  ),
  facebook: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1877F2"/>
      <path d="M16 8h-2c-.6 0-1 .4-1 1v2h3l-.4 3H13v7h-3v-7H8v-3h2V9c0-2.2 1.8-4 4-4h2v3z" fill="white"/>
    </svg>
  ),
  google: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="white" stroke="#e0e0e0" strokeWidth="0.5"/>
      <path d="M20.6 12.2c0-.6-.1-1.3-.2-1.8H12v3.5h4.8c-.2 1.1-.9 2-1.8 2.6v2.2h3c1.7-1.6 2.6-3.9 2.6-6.5z" fill="#4285F4"/>
      <path d="M12 21c2.4 0 4.5-.8 5.9-2.2l-3-2.2c-.8.5-1.8.8-2.9.8-2.2 0-4.1-1.5-4.7-3.6H4v2.3C5.5 19.1 8.6 21 12 21z" fill="#34A853"/>
      <path d="M7.3 13.8C7 13 6.9 12.2 6.9 11.4s.1-1.6.3-2.4V6.8H4c-.9 1.7-1.4 3.6-1.4 5.6s.5 3.9 1.4 5.6l3.3-2.2z" fill="#FBBC05"/>
      <path d="M12 7.8c1.2 0 2.3.4 3.2 1.2l2.4-2.4C16.5 5.3 14.4 4.4 12 4.4 8.6 4.4 5.5 6.3 4 9l3.3 2.3C8 9.3 9.8 7.8 12 7.8z" fill="#EA4335"/>
    </svg>
  ),
  wechat: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#07C160"/>
      <ellipse cx="10" cy="11" rx="4.5" ry="3.5" fill="white" opacity="0.95"/>
      <ellipse cx="16" cy="13" rx="3.5" ry="2.8" fill="white" opacity="0.75"/>
      <circle cx="8.5" cy="10.5" r="0.7" fill="#07C160"/>
      <circle cx="11.5" cy="10.5" r="0.7" fill="#07C160"/>
      <circle cx="14.8" cy="12.5" r="0.6" fill="#07C160"/>
      <circle cx="17" cy="12.5" r="0.6" fill="#07C160"/>
    </svg>
  ),
}

export function getPlatformLogo(platform: string, className = 'w-6 h-6') {
  const norm = normalizePlatform(platform)
  const Logo = PlatformLogo[norm]
  return Logo ? <Logo className={className} /> : null
}

export function getPlatformMeta(platform: string, isEn?: boolean): { label: string; bg: string; text: string; border: string } {
  const norm = normalizePlatform(platform)
  const meta: Record<string, { label: string; bg: string; text: string; border: string }> = {
    instagram:    { label: 'Instagram',  bg: 'bg-pink-50',   text: 'text-pink-600',   border: 'border-pink-200' },
    xiaohongshu:  { label: isEn ? 'Xiaohongshu' : '小红书',      bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-200'  },
    tiktok:       { label: 'TikTok',     bg: 'bg-slate-900', text: 'text-white',      border: 'border-slate-700'},
    facebook:     { label: 'Facebook',   bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-200' },
    google:       { label: 'Google',     bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200'},
    wechat:       { label: 'WeChat',     bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-200'},
  }
  return meta[norm] ?? { label: platform || (isEn ? 'Content' : '内容'), bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
}

export function buildPostUrl(platform: string, postUrl?: string | null): string | null {
  if (postUrl && (postUrl.startsWith('http://') || postUrl.startsWith('https://'))) return postUrl
  const norm = normalizePlatform(platform)
  const fallbacks: Record<string, string> = {
    instagram: 'https://www.instagram.com',
    xiaohongshu: 'https://www.xiaohongshu.com',
    tiktok: 'https://www.tiktok.com',
    facebook: 'https://www.facebook.com',
    google: 'https://www.google.com/maps',
    wechat: 'https://mp.weixin.qq.com',
  }
  return fallbacks[norm] ?? null
}
