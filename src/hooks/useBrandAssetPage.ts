'use client'

import { useEffect, useState } from 'react'

export interface BrandPickerAsset {
  id: string
  url: string
  filename?: string | null
  mimeType: string
  aiCategory?: string | null
  usedCount?: number
  createdAt?: string | Date
}

const PAGE_SIZE = 12

export function useBrandAssetPage(
  brandId: string,
  isOpen: boolean,
  filter: string,
  onAssets: (assets: BrandPickerAsset[]) => void,
) {
  const scope = `${brandId}:${isOpen}:${filter}`
  const [position, setPosition] = useState({ scope, page: 1 })
  const page = position.scope === scope ? position.page : 1
  const [revision, setRevision] = useState(0)
  const requestKey = `${scope}:${page}:${revision}`
  const [result, setResult] = useState<{
    key: string; assets: BrandPickerAsset[]; total: number; totalPages: number; error: boolean
  } | null>(null)

  useEffect(() => {
    // Persist resets even if the user switches away and back to the same filter.
    setPosition(current => current.scope === scope ? current : { scope, page: 1 })
  }, [scope])

  useEffect(() => {
    if (!isOpen || !brandId) return
    const controller = new AbortController()
    let active = true
    setResult(null)
    const load = async () => {
      try {
        const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/assets?page=${page}&pageSize=${PAGE_SIZE}&${filter}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (!Array.isArray(data.assets) || !data.pagination) throw new Error('Missing asset pagination')
        if (!active) return
        // A deletion may remove the final page while the drawer is open.
        const lastPage = Math.max(1, data.pagination.totalPages)
        if (page > lastPage) {
          setPosition({ scope, page: lastPage })
          return
        }
        onAssets(data.assets)
        setResult({ key: requestKey, assets: data.assets, total: data.pagination.total, totalPages: lastPage, error: false })
      } catch {
        if (active) setResult({ key: requestKey, assets: [], total: 0, totalPages: 1, error: true })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [brandId, isOpen, filter, page, scope, requestKey, onAssets])

  const current = result?.key === requestKey ? result : null
  return {
    assets: current?.assets ?? [],
    total: current?.total ?? 0,
    totalPages: current?.totalPages ?? 1,
    loading: isOpen && !current,
    error: current?.error ?? false,
    page,
    setPage: (next: number) => setPosition({ scope, page: next }),
    reload: () => setRevision(value => value + 1),
  }
}
