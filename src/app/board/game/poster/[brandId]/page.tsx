import { getActivityShareBrand } from '@/lib/activityShareMetadata'
import { notFound } from 'next/navigation'
import PosterClient from './PosterClient'

export const dynamic = 'force-dynamic'

type PosterTheme = 'black' | 'blue' | 'green' | 'purple' | 'gold'

function cleanText(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] || fallback
  return value || fallback
}

function cleanTheme(value: string | string[] | undefined): PosterTheme {
  const theme = cleanText(value, 'black')
  if (theme === 'blue' || theme === 'green' || theme === 'purple' || theme === 'gold') return theme
  return 'black'
}

export default async function GamePosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ brandId }, query] = await Promise.all([params, searchParams])
  const storeId = cleanText(query.store, '')
  const brand = await getActivityShareBrand(brandId, storeId)
  if (!brand) notFound()
  return (
    <PosterClient
      brandId={brandId}
      storeId={storeId}
      storeLabel={storeId ? brand.name : ''}
      title={cleanText(query.title, 'Scan & Win!')}
      desc={cleanText(query.desc, 'Leave a review to spin and win rewards instantly!')}
      theme={cleanTheme(query.theme)}
    />
  )
}
