type ShareClient = { share?: (data: { title: string; text: string; url: string }) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } }
export async function shareActivityPage(brandId: string, title: string, text: string, client: ShareClient): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = `https://amc.immedi.ai/game/${encodeURIComponent(brandId)}`
  if (client.share) {
    try { await client.share({ title, text, url }); return 'shared' }
    catch (error) { if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled' }
  }
  try { if (!client.clipboard) return 'failed'; await client.clipboard.writeText(url); return 'copied' }
  catch { return 'failed' }
}
