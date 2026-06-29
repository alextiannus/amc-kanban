/**
 * topicExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 轻量主题关键词萃取 + Jaccard 相似度计算，用于 Scheduler 30天重复内容检测。
 * 不依赖外部 embedding API，全部在本地完成。
 */

// ─── 停用词（中/英/马来/通用）────────────────────────────────────────────────
const STOP_WORDS = new Set([
  // English
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','this',
  'that','these','those','i','we','you','he','she','it','they','my','our',
  'your','his','her','its','their','what','which','who','how','when','where',
  'why','not','no','nor','so','as','if','then','than','because','while',
  'about','above','below','between','through','during','before','after',
  'get','just','also','only','more','some','all','any','each','every','both',
  'new','best','great','good','come','visit','try','enjoy','now','today',
  'us','me','him','her','them','we','very','really','absolutely','definitely',
  // Chinese common stop words
  '的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也',
  '很','到','说','要','去','你','会','着','没有','看','好','自己','这','那',
  '里','而','为','什么','来','他','她','它','们','这个','那个','时候','如果',
  '可以','因为','所以','但是','虽然','然后','还是','已经','这样','那样',
  '还','又','再','才','只','就是','比较','非常','真的','其实','大家','一些',
  // Malay
  'dan','atau','yang','di','ke','dari','dengan','untuk','adalah','ini','itu',
  'ada','tidak','akan','boleh','juga','saya','anda','kami','mereka','kita',
  // Singlish/common
  'lah','leh','lor','sia','mah','ah','hor',
])

// ─── 主题关键词萃取 ───────────────────────────────────────────────────────────

/**
 * 从 caption 中萃取主题关键词列表（去停用词、去短词、去标点）。
 * 返回 lowercase token 数组，最多 40 个。
 */
export function extractTopicKeywords(caption: string): string[] {
  if (!caption) return []

  // 1. 统一化：移除 emoji、URL、@提及、#hashtag 前缀、标点
  const cleaned = caption
    .replace(/https?:\/\/\S+/g, ' ')           // URLs
    .replace(/@\w+/g, ' ')                      // @mentions
    .replace(/#/g, ' ')                         // hashtag # → keep word
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, ' ')   // emoji
    .replace(/[^\u4e00-\u9fff\w\s]/g, ' ')     // punctuation (keep CJK + word chars)
    .toLowerCase()

  // 2. 分词（空格分割）
  const tokens = cleaned.split(/\s+/).filter(Boolean)

  // 3. 过滤停用词 + 短词（< 2 chars）+ 纯数字
  const keywords = tokens.filter(t =>
    t.length >= 2 &&
    !STOP_WORDS.has(t) &&
    !/^\d+$/.test(t)
  )

  // 4. 去重 + 截取前 40 个
  return [...new Set(keywords)].slice(0, 40)
}

// ─── Jaccard 相似度 ────────────────────────────────────────────────────────────

/**
 * 计算两个关键词集合的 Jaccard 相似度。
 * 返回 0~1 之间的浮点数，越大表示越相似。
 */
export function computeJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)

  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection++
  }

  const union = setA.size + setB.size - intersection
  if (union === 0) return 0
  return intersection / union
}

// ─── 重复检测（主函数）───────────────────────────────────────────────────────

export interface DuplicateMatch {
  draftId: string
  caption: string
  scheduledAt: Date | null
  publishedAt: Date | null
  similarity: number
}

/**
 * 检测目标 keywords 与历史内容列表的重复情况。
 * @param targetKeywords  目标草稿的关键词
 * @param historicalDrafts 过去N天的历史草稿，each with id/caption/topicKeywords/scheduledAt/publishedAt
 * @param threshold       Jaccard 阈值，超过此值视为重复（默认 0.45）
 */
export function detectTopicDuplicates(
  targetKeywords: string[],
  historicalDrafts: Array<{
    id: string
    caption: string
    topicKeywords: string[]
    scheduledAt: Date | null
    publishedAt: Date | null
  }>,
  threshold = 0.45
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []

  for (const draft of historicalDrafts) {
    // 如果历史草稿没有 topicKeywords，实时萃取
    const histKeywords = draft.topicKeywords.length > 0
      ? draft.topicKeywords
      : extractTopicKeywords(draft.caption)

    const similarity = computeJaccard(targetKeywords, histKeywords)
    if (similarity >= threshold) {
      matches.push({
        draftId: draft.id,
        caption: draft.caption.slice(0, 120),
        scheduledAt: draft.scheduledAt,
        publishedAt: draft.publishedAt,
        similarity: Math.round(similarity * 100) / 100,
      })
    }
  }

  // 按相似度降序排列
  return matches.sort((a, b) => b.similarity - a.similarity)
}
