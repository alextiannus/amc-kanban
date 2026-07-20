import CustomerGameClient from './CustomerGameClient'

export const dynamic = 'force-dynamic'

export default async function CustomerGamePage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  return <CustomerGameClient brandId={brandId} />
}
