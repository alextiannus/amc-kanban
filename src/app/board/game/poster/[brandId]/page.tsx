'use client'
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Printer, ArrowLeft } from 'lucide-react'

type PosterTheme = 'black' | 'blue' | 'green' | 'purple' | 'gold'

type BrandItem = {
  id: string
  name: string
}

export default function StickerPrintPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  
  const brandId = params.brandId as string
  const [stickerTitle, setStickerTitle] = useState(searchParams.get('title') || 'Scan & Win!')
  const [stickerDesc, setStickerDesc] = useState(searchParams.get('desc') || 'Leave a review to spin and win rewards instantly!')
  const isPosterTheme = (value: string | null): value is PosterTheme =>
    value === 'black' || value === 'blue' || value === 'green' || value === 'purple' || value === 'gold'
  const initialThemeParam = searchParams.get('theme')

  const [theme, setTheme] = useState<PosterTheme>(isPosterTheme(initialThemeParam) ? initialThemeParam : 'black')

  const [brandName, setBrandName] = useState('AMC Store')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [loading, setLoading] = useState(true)

  const themeColors = (({
    black: {
      badge: 'bg-slate-900 text-white',
      title: 'text-slate-950',
      borderAccent: 'border-slate-900/10',
      borderDouble: 'border-slate-900',
      qrBorder: 'border-slate-900',
    },
    blue: {
      badge: 'bg-blue-600 text-white',
      title: 'text-slate-950',
      borderAccent: 'border-blue-600/10',
      borderDouble: 'border-blue-600',
      qrBorder: 'border-blue-600',
    },
    green: {
      badge: 'bg-emerald-600 text-white',
      title: 'text-slate-950',
      borderAccent: 'border-emerald-600/10',
      borderDouble: 'border-emerald-600',
      qrBorder: 'border-emerald-600',
    },
    purple: {
      badge: 'bg-purple-600 text-white',
      title: 'text-slate-950',
      borderAccent: 'border-purple-600/10',
      borderDouble: 'border-purple-600',
      qrBorder: 'border-purple-600',
    },
    gold: {
      badge: 'bg-amber-500 text-white',
      title: 'text-slate-950',
      borderAccent: 'border-amber-500/10',
      borderDouble: 'border-amber-500',
      qrBorder: 'border-amber-500',
    },
  } as Record<string, { badge: string; title: string; borderAccent: string; borderDouble: string; qrBorder: string }>)[theme] || {
    badge: 'bg-slate-900 text-white',
    title: 'text-slate-950',
    borderAccent: 'border-slate-900/10',
    borderDouble: 'border-slate-900',
    qrBorder: 'border-slate-900',
  })

  useEffect(() => {
    if (!brandId) return

    // Fetch brand name & config publicly
    fetch(`/api/game/config?brandId=${brandId}&public=true`)
      .then(res => res.json())
      .then(async (data) => {
        // Fetch brand details
        const brandRes = await fetch('/api/brands')
        if (brandRes.ok) {
          const list = (await brandRes.json()) as BrandItem[]
          const brandObj = list.find((b) => b.id === brandId)
          if (brandObj) setBrandName(brandObj.name)
        }

        // Initialize values from config
        if (data.posterTitle) setStickerTitle(data.posterTitle)
        if (data.posterDesc) setStickerDesc(data.posterDesc)
        if (isPosterTheme(data.posterTheme)) setTheme(data.posterTheme)

        // Generate QR code for customer game H5
        const gameUrl = `${window.location.origin}/game/${brandId}`
        const qrDataUrl = await QRCode.toDataURL(gameUrl, {
          width: 400,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        })
        setQrCodeDataUrl(qrDataUrl)
        setLoading(false)

        // Automatically trigger print dialog
        setTimeout(() => {
          window.print()
        }, 1000)
      })
      .catch(err => {
        console.error('Failed to prepare print page', err)
        setLoading(false)
      })
  }, [brandId])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-slate-500">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-slate-900 mb-2"></div>
        <p className="text-sm font-semibold">Generating print layout...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start p-4 md:p-8 print:bg-white print:p-0 print:min-h-0">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            width: 80mm;
            height: 80mm;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden;
            background: white;
          }
          @page {
            size: 80mm 80mm;
            margin: 0;
          }
          .no-print {
            display: none !important;
          }
          .sticker-container {
            width: 80mm !important;
            height: 80mm !important;
            min-height: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            border: none !important;
            box-shadow: none !important;
            position: relative !important;
            top: 0 !important;
            left: 0 !important;
            border-radius: 0 !important;
          }
        }
      `}} />

      {/* Floating Control Banner (hidden during print) */}
      <div className="w-full max-w-[80mm] bg-white border border-slate-200 p-3 rounded-2xl shadow-md mb-8 flex flex-col gap-3.5 items-center print:hidden no-print">
        <div className="w-full flex justify-between items-center">
          <button 
            onClick={() => window.close()}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900 font-bold transition"
          >
            <ArrowLeft size={13} /> Close
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 active:scale-95 text-white text-[11px] font-bold rounded-lg shadow transition"
          >
            <Printer size={13} /> Print
          </button>
        </div>

        {/* Color presets inside floating banner */}
        <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-2 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">配色:</span>
          <div className="flex gap-1.5">
            {(['black', 'blue', 'green', 'purple', 'gold'] as const).map((t) => {
              const dotColor = {
                black: 'bg-slate-900',
                blue: 'bg-blue-600',
                green: 'bg-emerald-600',
                purple: 'bg-purple-600',
                gold: 'bg-amber-500',
              }
              const titleMap = {
                black: '曜石黑',
                blue: '极光蓝',
                green: '森林绿',
                purple: '紫罗兰',
                gold: '琥珀金',
              }
              return (
                <button
                  key={t}
                  title={titleMap[t]}
                  onClick={() => setTheme(t)}
                  className={`w-4.5 h-4.5 rounded-full flex items-center justify-center border transition-all ${
                    theme === t 
                      ? 'border-blue-500 scale-110 ring-2 ring-blue-500/20' 
                      : 'border-slate-200 hover:scale-105'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${dotColor[t]}`} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sticker Area (80mm x 80mm square) */}
      <div className="sticker-container w-[80mm] h-[80mm] bg-white border border-slate-350 p-4 flex flex-col items-center justify-between text-center text-slate-900 shadow-2xl relative overflow-hidden rounded-2xl">
        
        {/* Modern Border Accent */}
        <div className={`absolute inset-1.5 border-2 ${themeColors.borderAccent} pointer-events-none rounded-lg`} />
        <div className={`absolute inset-2 border ${themeColors.borderDouble} pointer-events-none rounded-md`} />

        {/* Top Header */}
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className={`sticker-badge px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.15em] leading-none ${themeColors.badge}`}>
            {brandName}
          </span>
          <h1 className={`text-lg font-black tracking-tight mt-1 leading-tight uppercase ${themeColors.title}`}>
            {stickerTitle}
          </h1>
          <p className="text-[9px] text-slate-500 max-w-[68mm] leading-tight font-medium mt-0.5">
            {stickerDesc}
          </p>
        </div>

        {/* Middle QR Code */}
        <div className="my-1.5 flex flex-col items-center">
          {qrCodeDataUrl ? (
            <div className={`p-1.5 bg-white border-2 ${themeColors.qrBorder} rounded-xl shadow-sm`}>
              <img src={qrCodeDataUrl} alt="Scan QR Code" className="w-[32mm] h-[32mm] object-contain" />
            </div>
          ) : (
            <div className="w-[32mm] h-[32mm] border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 text-[10px]">
              No QR Code
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mb-1 flex flex-col items-center">
          <p className="text-[7.5px] font-bold text-slate-450 uppercase tracking-[0.1em]">
            Scan to Spin & Claim Rewards
          </p>
        </div>

      </div>
    </div>
  )
}
