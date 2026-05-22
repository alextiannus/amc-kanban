'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Printer, ArrowLeft } from 'lucide-react'

export default function StickerPrintPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  
  const brandId = params.brandId as string
  const stickerTitle = searchParams.get('title') || 'Scan & Win!'
  const stickerDesc = searchParams.get('desc') || 'Leave a review to spin and win rewards instantly!'

  const [brandName, setBrandName] = useState('AMC Store')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brandId) return

    // Fetch brand name & config publicly
    fetch(`/api/game/config?brandId=${brandId}&public=true`)
      .then(res => res.json())
      .then(async (data) => {
        // Fetch brand details
        const brandRes = await fetch(`/api/brands`)
        if (brandRes.ok) {
          const list = await brandRes.json()
          const brandObj = list.find((b: any) => b.id === brandId)
          if (brandObj) setBrandName(brandObj.name)
        }

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
      <div className="w-full max-w-[80mm] bg-white border border-slate-200 p-3 rounded-2xl shadow-md mb-8 flex justify-between items-center print:hidden no-print">
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

      {/* Sticker Area (80mm x 80mm square) */}
      <div className="sticker-container w-[80mm] h-[80mm] bg-white border border-slate-350 p-4 flex flex-col items-center justify-between text-center text-slate-900 shadow-2xl relative overflow-hidden rounded-2xl">
        
        {/* Modern Border Accent */}
        <div className="absolute inset-1.5 border-2 border-slate-900/10 pointer-events-none rounded-lg" />
        <div className="absolute inset-2 border border-slate-900 pointer-events-none rounded-md" />

        {/* Top Header */}
        <div className="mt-1 flex flex-col items-center gap-1">
          <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[8px] font-black uppercase tracking-[0.15em] leading-none">
            {brandName}
          </span>
          <h1 className="text-lg font-black tracking-tight text-slate-950 mt-1 leading-tight uppercase">
            {stickerTitle}
          </h1>
          <p className="text-[9px] text-slate-500 max-w-[68mm] leading-tight font-medium mt-0.5">
            {stickerDesc}
          </p>
        </div>

        {/* Middle QR Code */}
        <div className="my-1.5 flex flex-col items-center">
          {qrCodeDataUrl ? (
            <div className="p-1.5 bg-white border-2 border-slate-900 rounded-xl shadow-sm">
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
