import { createHash } from 'node:crypto'

export function normalizeSocialUrl(value?: string | null): string {
  if (!value || !value.startsWith('http')) return ''
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return value.toLowerCase().split('?')[0].replace(/\/+$/, '')
  }
}

function normalizedText(value?: string | null): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function stableSocialSourceKey(input: {
  externalId?: string | null
  postUrl?: string | null
  platform?: string | null
  handle?: string | null
  publishedAt?: string | Date | null
  text?: string | null
}): string {
  if (input.externalId && String(input.externalId).trim()) return `id:${String(input.externalId).trim()}`
  const url = normalizeSocialUrl(input.postUrl)
  if (url) return `url:${url}`
  const date = input.publishedAt instanceof Date ? input.publishedAt : input.publishedAt ? new Date(input.publishedAt) : null
  const published = date && !Number.isNaN(date.getTime()) ? date.toISOString() : 'unknown-date'
  const fingerprint = [
    normalizedText(input.platform),
    normalizedText(input.handle),
    published.slice(0, 10),
    normalizedText(input.text),
  ].join('|')
  return `sha256:${createHash('sha256').update(fingerprint).digest('hex')}`
}
