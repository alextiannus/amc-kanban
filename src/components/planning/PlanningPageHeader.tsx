import Link from 'next/link'
import type { Brand } from './types'

type PlanningPageHeaderProps = {
  title: string
  description: string
  brands: Brand[]
  brandId: string
  onBrandChange: (brandId: string) => void
  siblingHref: string
  siblingLabel: string
}

export function PlanningPageHeader({
  title,
  description,
  brands,
  brandId,
  onBrandChange,
  siblingHref,
  siblingLabel,
}: PlanningPageHeaderProps) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/board" className="text-sm text-blue-600">← 返回工作台</Link>
        <h1 className="mt-3 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <Link href={siblingHref} className="mt-3 inline-flex text-sm font-medium text-blue-600">
          前往{siblingLabel} →
        </Link>
      </div>
      <select
        aria-label="选择品牌"
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
        value={brandId}
        onChange={(event) => onBrandChange(event.target.value)}
      >
        {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
    </header>
  )
}
