import fs from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

const PROFILE_SCHEMA_VERSION = '1.0.0'
const PROFILE_KIND = 'amc-brand-profile'

const AUTO_START = '<!-- AMC:BRAND_PROFILE:AUTO:START -->'
const AUTO_END = '<!-- AMC:BRAND_PROFILE:AUTO:END -->'
const MANUAL_START = '<!-- AMC:BRAND_PROFILE:MANUAL:START -->'
const MANUAL_END = '<!-- AMC:BRAND_PROFILE:MANUAL:END -->'
const STORES_CONFIG_START = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:START -->'
const STORES_CONFIG_END = '<!-- AMC:BRAND_PROFILE:STORES_CONFIG:END -->'

const PROFILE_DIR = path.join(process.cwd(), 'public/uploads/brand-profiles')

type BrandSnapshot = {
  id: string
  name: string
  description: string | null
  website: string | null
  phone: string | null
  address: string | null
  location: string | null
  timezone: string
  autoPilot: boolean
  googlePlaceId: string | null
  googleAccountId: string | null
  googleLocationId: string | null
  googleLocationName: string | null
  googleBusinessUrl: string | null
  googleReviewUrl: string | null
  postfastApiKey: string | null
  googleApiKey: string | null
  larkAppId: string | null
  larkAppSecret: string | null
  larkParentFolderToken: string | null
  larkDriveFolderId: string | null
  larkBotWebhook: string | null
  larkOwnerId: string | null
  accounts: Array<{
    id: string
    platformId: string
    handle: string
    displayName: string | null
    autoPilot: boolean
    followerCount: number | null
    followerDelta: number | null
    ratingScore: number | null
    profileUrl: string | null
    snapshotAt: Date | null
  }>
}

type RefreshResult = {
  brandId: string
  filePath: string
  relativePath: string
  markdown: string
}

function profileRelativePath(brandId: string) {
  return `uploads/brand-profiles/${brandId}.md`
}

export function getBrandProfilePath(brandId: string) {
  return path.join(PROFILE_DIR, `${brandId}.md`)
}

function buildDefaultManualSection() {
  return `${MANUAL_START}
## 10. 人工补充（此区块不会被系统刷新覆盖）

### 10.1 品牌定义与核心主张
- 使命 Mission:
- 愿景 Vision:
- 价值主张 Value Proposition:
- 品牌人格 Personification:

### 10.2 设计与视觉规范
- Logo 用法:
- 品牌色与辅助色:
- 字体策略:
- 图片/视频审美方向:
- 禁止事项（违禁词、禁用视觉风格）:

### 10.3 内容策略
- 内容支柱（Content Pillars）:
- 语气 Tone of Voice:
- 目标客群细分与沟通方式:
- 选题清单与热点策略:

### 10.4 多门店运营补充
- 门店命名规范:
- 各门店差异化定位:
- 各门店内容例外规则:

${STORES_CONFIG_START}
\`\`\`json
{
  "stores": []
}
\`\`\`
${STORES_CONFIG_END}

### 10.5 自媒体平台运营补充
- 平台优先级:
- 发布频率:
- 风险与审核要求:
- 平台专项策略:

### 10.6 扩展字段
如需扩展结构，可在下方使用 JSON/YAML 自定义新增字段（建议保留 schemaVersion 与 ext 命名空间）：

\`\`\`json
{
  "ext": {}
}
\`\`\`
${MANUAL_END}`
}

function extractBetween(text: string, start: string, end: string) {
  const startIdx = text.indexOf(start)
  const endIdx = text.indexOf(end)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null
  return text.slice(startIdx, endIdx + end.length)
}

function ensureManualSection(existing?: string) {
  if (!existing) return buildDefaultManualSection()
  return extractBetween(existing, MANUAL_START, MANUAL_END) || buildDefaultManualSection()
}

function buildStores(snapshot: BrandSnapshot) {
  const primaryStore = {
    storeId: 'main',
    name: snapshot.googleLocationName || `${snapshot.name} 主门店`,
    isPrimary: true,
    timezone: snapshot.timezone,
    address: snapshot.address,
    location: snapshot.location,
    contact: {
      phone: snapshot.phone,
      website: snapshot.website,
    },
    googleBusiness: {
      accountId: snapshot.googleAccountId,
      placeId: snapshot.googlePlaceId,
      locationId: snapshot.googleLocationId,
      locationName: snapshot.googleLocationName,
      businessUrl: snapshot.googleBusinessUrl,
      reviewUrl: snapshot.googleReviewUrl,
    },
    ext: {},
  }

  return [primaryStore]
}

function buildPlatformSummary(snapshot: BrandSnapshot) {
  const grouped = new Map<string, BrandSnapshot['accounts']>()
  for (const account of snapshot.accounts) {
    if (!grouped.has(account.platformId)) grouped.set(account.platformId, [])
    grouped.get(account.platformId)!.push(account)
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([platformId, accounts]) => ({
      platformId,
      accountCount: accounts.length,
      autoPilotEnabledAccounts: accounts.filter((a) => a.autoPilot).length,
      accounts: accounts.map((a) => ({
        accountId: a.id,
        handle: a.handle,
        displayName: a.displayName,
        profileUrl: a.profileUrl,
        followerCount: a.followerCount,
        followerDelta: a.followerDelta,
        ratingScore: a.ratingScore,
        autoPilot: a.autoPilot,
        snapshotAt: a.snapshotAt ? a.snapshotAt.toISOString() : null,
      })),
    }))
}

function buildAutoSection(snapshot: BrandSnapshot, generatedAt: string) {
  return `${AUTO_START}
## 1. 品牌基础信息（系统快照）
- brandId: ${snapshot.id}
- 名称: ${snapshot.name}
- 主理区域: ${snapshot.location || '未填写'}
- 时区: ${snapshot.timezone}
- 联系电话: ${snapshot.phone || '未填写'}
- 官网: ${snapshot.website || '未填写'}
- 主地址: ${snapshot.address || '未填写'}
- 自动驾驶（brand.autoPilot）: ${snapshot.autoPilot ? '开启' : '关闭'}
- 自动生成时间: ${generatedAt}

## 2. 品牌介绍（来自系统字段 description）
${snapshot.description || '（暂无，请在人工补充区完善品牌故事、定位、核心卖点与目标客群）'}

## 3. 品牌推广核心语境（建议 AI 预读）
- 业务类型与定位: 请在人工补充区的“品牌定义与核心主张”维护
- 内容调性与禁用项: 请在人工补充区的“设计与视觉规范”维护
- 内容支柱与选题策略: 请在人工补充区的“内容策略”维护

## 4. 扩展设计约定
- 本文件为“系统自动区块 + 人工补充区块”双区模型。
- 系统刷新仅覆盖自动区块，人工补充区保持不变。
- 推荐将新结构放入 JSON 的 ext 命名空间，避免破坏兼容性。
${AUTO_END}`
}

function buildFrontmatter(snapshot: BrandSnapshot, generatedAt: string) {
  return `---
profileType: ${PROFILE_KIND}
schemaVersion: ${PROFILE_SCHEMA_VERSION}
brandId: ${snapshot.id}
brandName: ${snapshot.name}
generatedAt: ${generatedAt}
---`
}

export async function loadBrandProfileSnapshot(brandId: string): Promise<BrandSnapshot | null> {
  return prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      description: true,
      website: true,
      phone: true,
      address: true,
      location: true,
      timezone: true,
      autoPilot: true,
      googlePlaceId: true,
      googleAccountId: true,
      googleLocationId: true,
      googleLocationName: true,
      googleBusinessUrl: true,
      googleReviewUrl: true,
      postfastApiKey: true,
      googleApiKey: true,
      larkAppId: true,
      larkAppSecret: true,
      larkParentFolderToken: true,
      larkDriveFolderId: true,
      larkBotWebhook: true,
      larkOwnerId: true,
      accounts: {
        orderBy: [{ platformId: 'asc' }, { handle: 'asc' }],
        select: {
          id: true,
          platformId: true,
          handle: true,
          displayName: true,
          autoPilot: true,
          followerCount: true,
          followerDelta: true,
          ratingScore: true,
          profileUrl: true,
          snapshotAt: true,
        },
      },
    },
  })
}

export async function composeBrandProfileMarkdown(brandId: string, existing?: string) {
  const snapshot = await loadBrandProfileSnapshot(brandId)
  if (!snapshot) return null

  const generatedAt = new Date().toISOString()
  const frontmatter = buildFrontmatter(snapshot, generatedAt)
  const autoSection = buildAutoSection(snapshot, generatedAt)
  const manualSection = ensureManualSection(existing)

  return `${frontmatter}

# ${snapshot.name} 品牌 Profile

> 该文件用于 AI 执行内容创作、品牌推广、门店运营协作前的预读上下文。
> 文件位置：${profileRelativePath(snapshot.id)}

${autoSection}

${manualSection}
`
}

export async function refreshBrandProfileMarkdown(brandId: string): Promise<RefreshResult | null> {
  const filePath = getBrandProfilePath(brandId)
  await fs.mkdir(PROFILE_DIR, { recursive: true })

  let existing = ''
  try {
    existing = await fs.readFile(filePath, 'utf-8')
  } catch {
    existing = ''
  }

  const markdown = await composeBrandProfileMarkdown(brandId, existing)
  if (!markdown) return null

  await fs.writeFile(filePath, markdown, 'utf-8')
  return {
    brandId,
    filePath,
    relativePath: profileRelativePath(brandId),
    markdown,
  }
}

export async function writeBrandProfileMarkdown(brandId: string, markdown: string): Promise<RefreshResult> {
  const filePath = getBrandProfilePath(brandId)
  await fs.mkdir(PROFILE_DIR, { recursive: true })
  await fs.writeFile(filePath, markdown, 'utf-8')
  return {
    brandId,
    filePath,
    relativePath: profileRelativePath(brandId),
    markdown,
  }
}

export async function readBrandProfileMarkdown(
  brandId: string,
  opts?: { ensureExists?: boolean; refresh?: boolean }
): Promise<RefreshResult | null> {
  const filePath = getBrandProfilePath(brandId)

  if (opts?.refresh) {
    return refreshBrandProfileMarkdown(brandId)
  }

  try {
    const markdown = await fs.readFile(filePath, 'utf-8')
    return {
      brandId,
      filePath,
      relativePath: profileRelativePath(brandId),
      markdown,
    }
  } catch {
    if (opts?.ensureExists === false) return null
    return refreshBrandProfileMarkdown(brandId)
  }
}

export function parseDescriptionFromMarkdown(markdown: string): string | null {
  const modernHeader = '## 品牌介绍'
  const legacyHeader = '## 2. 品牌介绍（来自系统字段 description）'
  const header = markdown.includes(modernHeader) ? modernHeader : legacyHeader
  const nextHeader = header === modernHeader ? '## 品牌定位与特征' : '## 3. 品牌推广核心语境'
  
  const idx = markdown.indexOf(header)
  if (idx === -1) return null
  
  const startIdx = idx + header.length
  const remaining = markdown.slice(startIdx)
  
  const nextIdx = remaining.indexOf(nextHeader)
  if (nextIdx === -1) {
    const fallbackIdx = remaining.search(/\n(##|#)\s/)
    if (fallbackIdx !== -1) {
      return remaining.slice(0, fallbackIdx).trim()
    }
    return remaining.trim()
  }
  
  return remaining.slice(0, nextIdx).trim()
}
