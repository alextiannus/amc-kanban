'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Printer, ArrowLeft } from 'lucide-react'

export default function PosterPrintPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  
  const brandId = params.brandId as string
  const posterTitle = searchParams.get('title') || 'Scan & Win!'
  const posterDesc = searchParams.get('desc') || 'Leave a review or share store photos to get free drinks and rewards!'

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
          width: 600,
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
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start p-4 md:p-8 print:bg-white print:p-0">
      
      {/* Floating Control Banner (hidden during print) */}
      <div className="w-full max-w-xl bg-white border border-slate-200 p-4 rounded-2xl shadow-md mb-8 flex justify-between items-center print:hidden">
        <button 
          onClick={() => window.close()}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-bold transition"
        >
          <ArrowLeft size={14} /> Close Window
        </button>
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-850 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition"
        >
          <Printer size={14} /> Print Poster
        </button>
      </div>

      {/* A4 Poster Area */}
      <div className="w-[210mm] min-h-[297mm] bg-white border border-slate-350 p-16 flex flex-col items-center justify-between text-center text-slate-900 shadow-2xl relative overflow-hidden print:w-full print:min-h-screen print:border-none print:shadow-none print:p-12">
        
        {/* Modern Border Accent */}
        <div className="absolute inset-6 border-[3px] border-slate-900/10 pointer-events-none rounded-xl" />
        <div className="absolute inset-8 border border-slate-900 pointer-events-none rounded-lg" />

        {/* Top Header */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <span className="px-4 py-1 rounded-full bg-slate-900 text-white text-sm font-extrabold uppercase tracking-[0.25em] leading-none">
            {brandName}
          </span>
          <h1 className="text-5xl font-black tracking-tight text-slate-950 mt-4 leading-tight uppercase">
            {posterTitle}
          </h1>
          <p className="text-xl text-slate-650 max-w-xl leading-relaxed mt-3 font-medium">
            {posterDesc}
          </p>
        </div>

        {/* Middle QR Code */}
        <div className="my-10 flex flex-col items-center">
          {qrCodeDataUrl ? (
            <div className="p-4 bg-white border-[6px] border-slate-900 rounded-3xl shadow-xl">
              <img src={qrCodeDataUrl} alt="Scan QR Code" className="w-[110mm] h-[110mm] object-contain" />
            </div>
          ) : (
            <div className="w-[110mm] h-[110mm] border border-dashed border-slate-300 rounded-3xl flex items-center justify-center text-slate-400 text-sm">
              Failed to generate QR Code
            </div>
          )}
        </div>

        {/* Instructions / Footer */}
        <div className="mb-8 flex flex-col items-center gap-6">
          <div className="flex justify-center items-center gap-8 text-left">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full border-[2.5px] border-slate-900 flex items-center justify-center text-sm font-black flex-shrink-0">1</span>
              <div>
                <p className="font-extrabold text-sm uppercase tracking-wider text-slate-900">Scan QR Code</p>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">Use your mobile camera</p>
              </div>
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full border-[2.5px] border-slate-900 flex items-center justify-center text-sm font-black flex-shrink-0">2</span>
              <div>
                <p className="font-extrabold text-sm uppercase tracking-wider text-slate-900">Share review/photo</p>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">AI instantly checks</p>
              </div>
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full border-[2.5px] border-slate-900 flex items-center justify-center text-sm font-black flex-shrink-0">3</span>
              <div>
                <p className="font-extrabold text-sm uppercase tracking-wider text-slate-900">Spin the Wheel!</p>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">Claim rewards instantly</p>
              </div>
            </div>
          </div>
          
          <div className="h-px w-20 bg-slate-300 mt-2" />
          <p className="text-xs font-bold text-slate-450 uppercase tracking-[0.15em]">
            Powered by AMC AI Marketing Assistant
          </p>
        </div>

      </div>
    </div>
  )
}
