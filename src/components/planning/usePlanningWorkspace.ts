'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Brand, InspirationLibrary, PlanningData, PromotionPlan } from './types'

const ACTIVE_BRAND_KEY = 'dashboard.activeBrandId'

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '操作失败')
  }
  return payload
}

async function fetchPlanningData(brandId: string) {
  const response = await fetch(`/api/brands/${brandId}/planning`, { cache: 'no-store' })
  return await readJson(response) as PlanningData
}

export function usePlanningWorkspace() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState('')
  const [data, setData] = useState<PlanningData | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (id: string) => {
    if (!id) return
    setData(await fetchPlanningData(id))
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch('/api/brands')
      .then(readJson)
      .then((payload) => {
        if (cancelled) return
        const items = Array.isArray(payload) ? payload as Brand[] : []
        setBrands(items)
        const saved = localStorage.getItem(ACTIVE_BRAND_KEY)
        const selected = items.find((item) => item.id === saved)?.id || items[0]?.id || ''
        setBrandId(selected)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '品牌加载失败')
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!brandId) return
    let cancelled = false
    fetchPlanningData(brandId)
      .then((payload) => { if (!cancelled) setData(payload) })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '加载失败')
      })
    return () => { cancelled = true }
  }, [brandId])

  const selectBrand = useCallback((id: string) => {
    setData(null)
    setError('')
    setBrandId(id)
    try { localStorage.setItem(ACTIVE_BRAND_KEY, id) } catch { /* ignore storage failures */ }
  }, [])

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!brandId) return false
    setBusy(action)
    setError('')
    try {
      const response = await fetch(`/api/brands/${brandId}/planning`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      await readJson(response)
      await load(brandId)
      return true
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '操作失败')
      return false
    } finally {
      setBusy('')
    }
  }, [brandId, load])

  const currentLibrary = useMemo<InspirationLibrary | undefined>(() => (
    data?.libraries?.find((item) => item.state !== 'superseded') || data?.libraries?.[0]
  ), [data?.libraries])

  const approvedLibrary = useMemo<InspirationLibrary | undefined>(() => (
    data?.libraries?.find((item) => item.state === 'approved')
  ), [data?.libraries])

  const getPlan = useCallback((periodDays: number): PromotionPlan | undefined => (
    data?.plans?.find((item) => item.periodDays === periodDays && item.state !== 'superseded')
      || data?.plans?.find((item) => item.periodDays === periodDays)
  ), [data?.plans])

  return {
    brands,
    brandId,
    selectBrand,
    data,
    busy,
    error,
    act,
    currentLibrary,
    approvedLibrary,
    getPlan,
  }
}
