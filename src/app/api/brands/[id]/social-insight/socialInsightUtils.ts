const EN_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'was', 'are',
  'were', 'be', 'been', 'has', 'have', 'had', 'do', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'this', 'that', 'it', 'they', 'we', 'i', 'you', 'he', 'she', 'very', 'so',
  'really', 'just', 'here', 'there', 'their', 'our', 'my', 'your', 'its', 'not', 'no', 'also', 'more',
  'about', 'than', 'from', 'by', 'all', 'as', 'if', 'then', 'when', 'where', 'which', 'who', 'what',
  'how', 'get', 'got', 'went', 'said', 'come', 'came', 'go', 'well', 'good', 'great', 'nice', 'love',
  'loved', 'like', 'liked', 'make', 'made', 'place', 'time', 'times', 'back', 'always', 'never',
  'definitely', 'absolutely', 'highly', 'would', 'recommend', 'overall', 'experience',
])

const POSITIVE_SIGNALS = new Set([
  'amazing', 'excellent', 'fantastic', 'wonderful', 'great', 'good', 'best', 'delicious', 'fresh',
  'friendly', 'love', 'perfect', 'outstanding', 'awesome', 'incredible', 'superb', 'tasty',
  'beautiful', 'clean', 'fast', 'quick', 'efficient', 'helpful', 'recommend', 'wonderful',
  '好吃', '美味', '新鲜', '服务好', '环境好', '推荐', '好评', '满意', '非常棒', '赞',
  'authentic', 'flavorful', 'generous', 'attentive', 'warm', 'cozy',
])

const NEGATIVE_SIGNALS = new Set([
  'bad', 'terrible', 'awful', 'horrible', 'worst', 'slow', 'dirty', 'rude', 'expensive',
  'disappointing', 'poor', 'mediocre', 'cold', 'hard', 'stale', 'loud', 'crowded',
  'overpriced', 'wait', 'waiting', 'waited', 'wrong', 'missing', 'undercooked', 'greasy',
  '难吃', '太贵', '等待', '慢', '脏', '差评', '不好', '失望', '冷',
])

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function extractKeywordsFromTexts(
  texts: string[]
): Array<{ text: string; count: number; sentiment: 'positive' | 'negative' | 'neutral'; isSynthetic: boolean }> {
  if (texts.length === 0) return []

  const wordFreq: Record<string, number> = {}

  for (const rawText of texts) {
    const text = rawText.toLowerCase()

    const words = text
      .split(/[\s,.\!?;:"""''()\[\]\/\\]+/g)
      .filter((w) => w.length > 3 && !EN_STOP_WORDS.has(w) && /^[a-z\u4e00-\u9fff\-']+$/.test(w))
    words.forEach((w) => {
      wordFreq[w] = (wordFreq[w] ?? 0) + 1
    })

    const rawWords = text.split(/\s+/)
    for (let i = 0; i < rawWords.length - 1; i++) {
      const w1 = rawWords[i].replace(/[^a-z]/g, '')
      const w2 = rawWords[i + 1].replace(/[^a-z]/g, '')
      if (w1.length > 3 && w2.length > 3 && !EN_STOP_WORDS.has(w1) && !EN_STOP_WORDS.has(w2)) {
        const phrase = `${w1} ${w2}`
        wordFreq[phrase] = (wordFreq[phrase] ?? 0) + 1
      }
    }
  }

  return Object.entries(wordFreq)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 14)
    .map(([text, count]) => ({
      text,
      count,
      sentiment: (POSITIVE_SIGNALS.has(text) ? 'positive' : NEGATIVE_SIGNALS.has(text) ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral',
      isSynthetic: false,
    }))
}

export function computePeriodTrend(series: Array<Record<string, number | string>>, metric: string): number | null {
  if (!series || series.length < 4) return null
  const mid = Math.floor(series.length / 2)
  const firstHalf = series.slice(0, mid)
  const secondHalf = series.slice(mid)
  const firstSum = firstHalf.reduce((s, d) => s + toNumber(d[metric]), 0)
  const secondSum = secondHalf.reduce((s, d) => s + toNumber(d[metric]), 0)
  if (firstSum === 0) return secondSum > 0 ? 100 : null
  return Number((((secondSum - firstSum) / firstSum) * 100).toFixed(1))
}

export function detectContentType(caption: string, mediaUrls: string[], hashtags: string[]): string {
  const cap = (caption ?? '').toLowerCase()
  const tags = (hashtags ?? []).map((h) => h.toLowerCase())
  if (tags.some((t) => t.includes('reel') || t.includes('short') || t.includes('tiktok')) || cap.includes('#reels')) return 'SHORT'
  if (tags.some((t) => t.includes('story') || t.includes('stories'))) return 'STORY'
  if ((mediaUrls ?? []).some((u) => u.match(/\.(mp4|mov|avi|webm)/i))) return 'VIDEO'
  if ((mediaUrls ?? []).length > 0) return 'IMAGE'
  if (cap.length > 400) return 'LONG'
  return 'SHORT'
}
