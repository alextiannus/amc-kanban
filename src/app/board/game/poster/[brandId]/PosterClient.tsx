'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { getPermanentGameUrl, PERMANENT_GAME_QR_OPTIONS } from '@/lib/gameQr'

type PosterTheme = 'black' | 'blue' | 'green' | 'purple' | 'gold'

const themeMap: Record<PosterTheme, { accent: string; soft: string }> = {
  black: { accent: '#0f172a', soft: '#f8fafc' },
  blue: { accent: '#2563eb', soft: '#eff6ff' },
  green: { accent: '#059669', soft: '#ecfdf5' },
  purple: { accent: '#7c3aed', soft: '#f5f3ff' },
  gold: { accent: '#d97706', soft: '#fffbeb' },
}

export default function PosterClient({
  brandId,
  title,
  desc,
  theme,
}: {
  brandId: string
  title: string
  desc: string
  theme: PosterTheme
}) {
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const colors = themeMap[theme] || themeMap.black

  useEffect(() => {
    void QRCode.toDataURL(getPermanentGameUrl(brandId), PERMANENT_GAME_QR_OPTIONS).then(setQrCodeUrl)
  }, [brandId])

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950 print:bg-white print:p-0">
      <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center gap-4 print:min-h-0">
        <section
          className="flex aspect-square w-full max-w-[420px] flex-col items-center justify-between overflow-hidden rounded-[28px] border-[10px] bg-white p-8 text-center shadow-xl print:max-w-[80mm] print:rounded-none print:border-[4px] print:p-3 print:shadow-none"
          style={{ borderColor: colors.accent, background: colors.soft }}
        >
          <div>
            <p className="inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-white print:text-[7px]" style={{ background: colors.accent }}>
              AMC Activity
            </p>
            <h1 className="mt-5 text-4xl font-black uppercase leading-none print:mt-2 print:text-[18px]" style={{ color: colors.accent }}>
              {title}
            </h1>
            <p className="mt-3 text-base font-bold leading-snug text-slate-600 print:mt-1 print:text-[8px]">{desc}</p>
          </div>

          <div className="rounded-[28px] bg-white p-4 shadow-md print:rounded-lg print:p-1 print:shadow-none">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Game QR code" className="h-56 w-56 print:h-[42mm] print:w-[42mm]" />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-2xl bg-slate-100 print:h-[42mm] print:w-[42mm]" />
            )}
          </div>

          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500 print:text-[6px]">
            Scan to spin and claim rewards
          </p>
        </section>

        <button
          onClick={() => window.print()}
          className="rounded-2xl px-5 py-3 text-sm font-black text-white shadow-lg print:hidden"
          style={{ background: colors.accent }}
        >
          Print sticker
        </button>
      </div>
    </main>
  )
}
