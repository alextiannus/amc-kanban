'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export interface SocialAccountSnapshot {
  id: string
  platformId: string
  handle: string
  displayName: string | null
  autoPilot: boolean
  followerCount: number | null
  followerDelta: number | null
  ratingScore: number | null
  snapshotAt: string | null
}

export interface ActionItemData {
  id: string
  type: string   // content_approval | sentiment_alert | material_request
  priority: string  // urgent | high | normal
  title: string
  description: string
  payload: Record<string, unknown> | null
  status: string
  draftId: string | null
  draft: {
    id: string
    caption: string
    mediaUrls: string[]
    scheduledAt: string | null
    captionLang: string
  } | null
  account: {
    platformId: string
    handle: string
    displayName: string | null
  } | null
  createdAt: string
}

export interface BrandData {
  id: string
  name: string
  location: string | null
  timezone: string
  autoPilot: boolean
  accounts: SocialAccountSnapshot[]
  actionItems: ActionItemData[]
  _count: { actionItems: number; contents: number; assets: number }
  weekConversions: Array<{ type: string; source: string; _count: { id: number } }>
}

export function useBrand(brandId: string | null) {
  const [data, setData] = useState<BrandData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/brands/${id}`, { signal: abortRef.current.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : 'Failed to load brand')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!brandId) return

    void (async () => {
      await load(brandId)
    })()
    return () => abortRef.current?.abort()
  }, [brandId, load])

  return { data, loading, error, refetch: () => brandId && load(brandId) }
}

export function useBrandList() {
  const [brands, setBrands] = useState<Array<{ id: string; name: string; location: string | null; _count: { actionItems: number } }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.json())
      .then(setBrands)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { brands, loading }
}

// Approve or reject an action item
export async function resolveActionItem(
  brandId: string,
  itemId: string,
  action: 'approve' | 'reject',
  opts?: { note?: string; selectedReply?: number }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/brands/${brandId}/actions/${itemId}/${action}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts || {}),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { ok: false, error: j.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : '操作失败' }
  }
}

// Toggle brand autoPilot
export async function setBrandAutoPilot(brandId: string, autoPilot: boolean) {
  return fetch(`/api/brands/${brandId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autoPilot }),
  })
}

// Add a social account
export async function addSocialAccount(brandId: string, platformId: string, handle: string) {
  return fetch(`/api/brands/${brandId}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platformId, handle }),
  })
}
