import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getActivityShareBrand, activityShareImageUrl } from '@/lib/activityShareMetadata'
import { activitySharePresentation } from '@/lib/activitySharePresentation'
import CustomerGameClient from './CustomerGameClient'

export const dynamic = 'force-dynamic'

export default async function CustomerGamePage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  return <CustomerGameClient brandId={brandId} />
}

export async function generateMetadata({ params }: { params: Promise<{ brandId: string }> }): Promise<Metadata> {
  const { brandId } = await params
  const brand = await getActivityShareBrand(brandId)
  if (!brand) return { title: '店内活动', robots: { index: false, follow: false } }
  const language = (await headers()).get('accept-language')?.split(',')[0]?.trim().toLowerCase() || 'zh'
  const locale = language.startsWith('zh') ? 'zh' : 'en'
  const copy = activitySharePresentation(brand.name, brand.page, locale)
  const url = `https://amc.immedi.ai/game/${encodeURIComponent(brandId)}`
  const image = activityShareImageUrl(brandId, brand, locale)
  return {
    title: { absolute: copy.title }, description: copy.description, applicationName: brand.name,
    appleWebApp: { title: brand.name }, alternates: { canonical: url },
    openGraph: { type: 'website', title: copy.title, description: copy.description, siteName: brand.name, url, locale: locale === 'zh' ? 'zh_CN' : 'en_US', images: [{ url: image, width: 800, height: 800, alt: brand.name }] },
    twitter: { card: 'summary', title: copy.title, description: copy.description, images: [image] },
    icons: { icon: [{ url: image, type: 'image/png' }], apple: [{ url: image, type: 'image/png' }] },
  }
}
