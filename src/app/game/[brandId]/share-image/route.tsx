import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getActivityShareBrand } from '@/lib/activityShareMetadata'
import ActivityShareCard from '@/components/ActivityShareCard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
let artwork: Promise<{ font: ArrayBuffer; logo: string }> | undefined
export async function GET(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  const brand = await getActivityShareBrand(brandId, new URL(request.url).searchParams.get('store') || '')
  if (!brand) return new Response('Not found', { status: 404 })
  const locale = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'zh'
  artwork ??= Promise.all([readFile(path.join(process.cwd(), 'public/fonts/activity-noto-sans-sc-600.woff')), readFile(path.join(process.cwd(), 'public/logos/amc-sunflower.svg'))]).then(([font, logo]) => ({ font: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer, logo: `data:image/svg+xml;base64,${logo.toString('base64')}` })).catch(error => { artwork = undefined; throw error })
  const { font, logo } = await artwork
  return new ImageResponse(<ActivityShareCard name={brand.name} color={brand.color} locale={locale} logo={logo}/>, { width: 800, height: 800, fonts: [{ name: 'Activity Sans', data: font, weight: 600, style: 'normal' }], headers: { 'Cache-Control': 'public, max-age=3600' } })
}
