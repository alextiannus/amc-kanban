type UnknownRecord = Record<string, unknown>

function objectValue(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function platformLabel(value: string) {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'instagram') return 'Instagram'
  if (normalized === 'tiktok') return 'TikTok'
  if (normalized === 'xiaohongshu') return '小红书'
  if (normalized === 'google_business') return 'Google Business'
  if (normalized === 'facebook') return 'Facebook'
  return value
}

function promotionPointLabel(point: UnknownRecord) {
  const name = text(point.name)
  const id = text(point.id)
  const match = id.match(/^bp_(\d{4})(\d{2})_(\d+)$/)
  const fallback = match ? `${match[1]} 年 ${Number(match[2])} 月第 ${Number(match[3])} 个推广点` : id || '未命名推广点'
  const platforms = stringList(point.platforms).map(platformLabel)
  const metrics = [
    numberDetail(point.candidateCount, '候选'),
    numberDetail(point.returnedCount, '返回'),
    numberDetail(point.rankedCount, '入围'),
    numberDetail(point.persistedRankedCount, '已生成 creative'),
  ].filter(Boolean)
  const reasons = stringList(point.gapReasons).map(gapReasonLabel)
  return [
    `• ${name ? `「${name}」` : fallback}${platforms.length ? `（平台：${platforms.join('、')}）` : ''}${metrics.length ? `：${metrics.join('，')}` : ''}`,
    reasons.length ? `  原因：${reasons.join('；')}` : '',
  ].filter(Boolean).join('\n')
}

function numberDetail(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return ''
  const count = Number(value)
  return Number.isFinite(count) ? `${label} ${count}` : ''
}

function gapReasonLabel(value: string) {
  if (value === 'matched_creatives_missing_persisted_identity') return '有相关行，但未绑定可用 creative 身份'
  if (value === 'no_persisted_creatives_available') return '没有已生成且可引用的 creative'
  if (value === 'no_ranked_creatives_for_platform') return '搜索有结果但相关度未达入围标准'
  if (value === 'content_library_search_failed') return 'Content 灵感库搜索失败'
  if (value === 'using_cross_platform_food_creative') return '可用跨平台餐饮灵感改写'
  return value
}

function legacyDetails(error: string) {
  if (!error.startsWith('calendar_content_creative_missing:')) return {}
  try {
    const parsed = JSON.parse(error.slice('calendar_content_creative_missing:'.length))
    const value = objectValue(parsed)
    return {
      ...value,
      missingPromotionPoints: stringList(value.missingPromotionPointIds).map((id) => ({ id })),
    }
  } catch {
    return {}
  }
}

export function calendarCreativeErrorMessage(payload: unknown) {
  const response = objectValue(payload)
  const rawError = text(response.error || payload)
  const code = text(response.code) || rawError.split(':', 1)[0]
  if (code !== 'calendar_content_creative_missing') return undefined

  const details: UnknownRecord = Object.keys(objectValue(response.details)).length
    ? objectValue(response.details)
    : legacyDetails(rawError)
  const missingPromotionPoints = Array.isArray(details.missingPromotionPoints)
    ? details.missingPromotionPoints.map(objectValue)
    : []
  const pointLines = missingPromotionPoints.length
    ? missingPromotionPoints.map(promotionPointLabel).join('\n')
    : '• 当前月份至少有一个推广点尚未找到可靠匹配'

  return [
    '内容计划暂未生成：本次在 Content 灵感库中没有找到以下推广点的可靠匹配：',
    pointLines,
    '请人工确认：在 Content 灵感库搜索上述主题，检查相关灵感是否已入库、已生成 creative，并具有清晰的标题、正文或标签；Google Business 可借用 Instagram/TikTok 餐饮灵感改写。',
    '确认或补充后再重试；本次没有写入任何日历卡片。',
  ].join('\n')
}
