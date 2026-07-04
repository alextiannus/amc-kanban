# AIERA v2 — AI 内容生产引擎升级 PRD

> **Product**: AMC-Kanban — AI Content Engine
> **Version**: v2.1 AIERA (AI Era Architecture)
> **Author**: Research + Design Session — 2026-07-04
> **Last Updated**: 2026-07-04 — Copywriter 能力建设方案补充完成
> **Status**: ✅ 设计锁定，Phase 1 已实施，Phase 2A Copywriter 质量闭环为下一步优先项

---

## 一、背景与核心问题

当前 Copywriter Agent（`copywriter.ts`）存在以下结构性局限：

| 问题 | 表现 | 根因 |
|------|------|------|
| 文案同质化 | 小红书每次用同一开头公式 | Hook 模板硬编码在 prompt 字符串里 |
| 能力固化 | 无法引入新平台知识 | 每次升级需要修改代码重新部署 |
| 无记忆 | 不知道自己上次用了什么 | 无历史感知机制 |
| 不可扩展 | 并发高时会阻塞 | 同步调用 LLM，无任务队列 |
| 纯文字 | 无视频脚本/图生视频能力 | 只集成了文字 LLM |

**AIERA v2 的目标**：将 Copywriter 从一个"写死的 AI 模板"升级为一个面向**本地生活商户（Local Lifestyle / Local Services）**的**自学习、可扩展、高并发、多模态 AI 内容生产引擎**。

> 定位说明：AMC 的主体行业不是单一餐饮，而是本地生活。餐饮/F&B 是高频切入垂类之一；同一套内容引擎必须支持美容美甲、健身普拉提、家装维修、宠物服务、教育培训、酒水零售、诊所护理、休闲娱乐等线下服务商户。

---

## 二、下一步设计结论 — Copywriter 能力优先升级

开场白能力已经达到当前阶段要求，AIERA v2 的下一步不再优先扩展 Companion Greeting，而是集中提升 AMC Copywriter 的内容生产质量、可控性和可持续学习能力。

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| 先质量，后规模 | 在引入 BullMQ、视频生成和大规模并发前，先把单篇文案的质量、稳定性和可解释性打牢。 |
| 先闭环，后微调 | 不直接跳到 SFT/DPO；先建立从生成、人工编辑、评分、知识沉淀、下次检索的闭环。 |
| 行业泛化优先 | 所有 Brief、Skill、Knowledge、Quality Gate 设计必须以本地生活行业族群为边界，避免把餐饮术语写死进核心流水线。 |
| Skill 管规范，Knowledge 管经验 | Platform Skill 负责平台规则、格式、禁忌词；KnowledgeEntry 负责历史高表现样本、品牌偏好和人工修正。 |
| Agent 可执行，但必须可审计 | 每次生成必须留下 CopywriterLog，记录 promptVersion、platform、draftId、modelId、输出和后续人工修正。 |
| 不让模型凭感觉决定发布 | Copywriter 只负责生成与修订；审批、排期、发布继续走 ContentDraft / ActionItem / Publisher 的显式状态机。 |

### 2.2 目标能力分层

```
用户创意 / 素材 / 排期任务
        ↓
Brief Normalizer（意图理解与创意简报结构化）
        ↓
Context Builder（品牌、素材、历史表现、Skill、知识库）
        ↓
Hook Competition（多类别 Hook 候选 + 去重 + 评分）
        ↓
Body Composer（平台正文、CTA、Hashtag）
        ↓
Quality Gate（AI 腔、平台格式、合规、品牌知识校验）
        ↓
Draft Writer（写入 ContentDraft，创建待审 ActionItem）
        ↓
Feedback Loop（人工编辑 / 发布表现 → CopywriterLog / UserCorrectionFeedback / KnowledgeEntry）
```

### 2.3 本阶段最终方案

下一阶段定义为 **Phase 2A — Copywriter Quality Loop**，目标是在不大改业务入口的前提下，让现有 `/copywriter/bulk-generate`、`trigger-copywriter` 和 `copywriterNode` 具备稳定的四阶段生成、质量门禁和学习闭环。

**必须实现：**
- `copywriterNode` 从当前的 Hook + Body 两阶段升级为 Brief + Hook + Body + Quality Gate 的流水线。
- Brief 结构化必须先识别 `industryVertical`、`offerType`、`customerIntent` 和 `localProof`，再决定文案角度；不能默认按餐饮/菜单/菜品生成。
- Hook 生成从“随机抽一个”升级为“候选评分 + 最近历史去重 + 平台类别均衡”。
- `CopywriterLog` 成为训练与审计主记录，必须绑定 `draftId`、`platform`、`promptVersion` 和模型信息。
- 人工编辑后的最终发布文案进入 `UserCorrectionFeedback`，作为短期 few-shot；高质量样本再晋升为 `KnowledgeEntry`。
- Platform Skill 只读 Markdown 继续保留，作为平台规范来源；不在短期引入外部 GitHub/URL Skill 执行链路。
- Quality Gate 必须在写入草稿前执行 AI 腔词、平台格式、品牌禁忌词和基础合规检查；失败时自动重写一次，仍失败则以 `ActionItem` 交给人工审核。

**暂不实现：**
- 暂不启动专属模型微调；仅保留训练数据导出。
- 暂不做 URL/GitHub 外部 Skill 自动同步；避免 prompt injection 与供应链风险。
- 暂不把视频生成并入 Copywriter 主链路；视频作为 Phase 4 的用户主动触发能力。
- 暂不把所有 Copywriter 请求改为队列；Phase 2A 保持同步接口，Phase 3 再做 BullMQ。

### 2.4 成功指标

| 指标 | 目标 |
|------|------|
| 人工大改率 | 发布前人工修改 diffRatio > 0.4 的比例下降 30% |
| AI 腔拦截率 | Quality Gate 能识别并拦截内置禁忌词，命中后自动重写 |
| Hook 重复率 | 同品牌同平台最近 10 篇 Hook 类别重复率低于 30% |
| 生成可用率 | LLM 正常时 90% 以上生成结果可直接进入 pending_review |
| 审计完整性 | 95% 以上 Copywriter 输出可追溯到 CopywriterLog + draftId |

---

## 三、六大核心需求与设计方案

---

### 需求 1 — Copywriter 智能升级

**目标**：提升每篇内容的创作质量和多样性，消除 AI 腔。

#### 1.1 两阶段 → 四阶段创作流水线

```
当前:  [Hook生成] → [Body生成]
升级:  [Brief结构化] → [Hook竞选] → [Body精炼] → [Quality Gate]
```

**Stage 0 — Brief 结构化（新增）**
- 输入：task + mediaUrls + brand context
- 输出：`{ industryVertical, offerType, customerIntent, theme, angle, targetEmotion, contentType, formatHint, mustMention, mustAvoid, locationFocus, localProof }`
- 使用轻量模型（Gemini Flash）降低延迟和成本
- 行业识别必须支持本地生活垂类：
  - `food_beverage`
  - `beauty_wellness`
  - `fitness_pilates`
  - `home_renovation`
  - `pet_services`
  - `education_training`
  - `healthcare_clinic`
  - `retail_specialty`
  - `events_entertainment`
  - `professional_services`
  - `general_local_service`

**Stage 1 — Hook 竞选（升级）**
- 生成 5 个 hooks（比当前 3 个更多），分属 5 大心理类别
- 每个 hook 标注所属 category + 情绪强度评分
- 过滤机制：排除与最近 10 篇同平台帖子重复的 category
- 最终随机抽取（当前已实现）→ 升级为按**质量评分加权**抽取

**Stage 2 — Body 精炼（升级）**
- 加入「AI 腔检测」指令：禁用特定高频 AI 词汇清单
- 加入「平台 Skill」调用（见需求 4）
- 支持多轮自我修订：Body 生成后自动检查是否满足平台格式规范

**Stage 3 — Quality Gate（新增）**
- 输入：caption + hashtags + platform + brand compliance + selected skill
- 输出：`{ passed, score, reasons[], rewriteInstruction? }`
- 检查项：
  - AI 腔词汇与平台 Skill 禁忌词
  - 品牌 `negPrompts` 与合规禁用词
  - 平台格式要求（小红书换行/emoji/标签数、GBP 无 hashtag 等）
  - 必填信息（地址、预约方式、活动日期、促销条款）
  - 与最近同品牌同平台内容的 Hook/主题重复度
- 处理策略：第一次失败自动带 `rewriteInstruction` 重写；第二次失败仍写入草稿但标记 `pending_review`，并创建高优先级 ActionItem 给人工检查。

#### 1.2 AI 腔词汇黑名单（内置）

以下词汇检测后自动要求重写：
> 我不允许还有人不知道 / 直接封神 / 作为AI / 截至我的知识截止日期 /
> Discover the secrets / Game-changer / In today's fast-paced world

---

### 需求 2 — 开源 Skill 加载机制（外部能力）

**目标**：以文件系统 + DB 配置的方式动态加载外部写作能力，不需要重新部署。

#### 2.1 Skill 系统架构

参考现有 `.agents/skills/` 结构，定义 **CopywriterSkill** 规范：

```
src/agents/skills/
├── platforms/
│   ├── xiaohongshu/
│   │   ├── SKILL.md         ← 主指令文件
│   │   ├── hooks.json       ← Hook 公式库（可热更新）
│   │   ├── examples/        ← Few-shot 爆文样本
│   │   └── forbidden.txt    ← 平台违禁词
│   ├── instagram/
│   ├── tiktok/
│   ├── facebook/
│   └── google_business/
├── formats/
│   ├── local_discovery.md   ← 本地探店/服务发现格式 Skill
│   ├── service_offer.md     ← 服务项目/套餐促销格式 Skill
│   ├── product_launch.md    ← 新品/新项目上市格式 Skill
│   └── event_promotion.md   ← 活动促销格式 Skill
└── external/                ← 从开源社区导入的 Skill
    └── [git submodule or URL]
```

#### 2.2 外部 Skill 加载协议

```typescript
// DB 表: CopywriterSkill
interface CopywriterSkill {
  id: string
  name: string
  platform: string         // 'xiaohongshu' | 'instagram' | '*'
  sourceType: 'local' | 'github' | 'url'
  sourceRef: string        // 本地路径 or GitHub URL
  isActive: boolean
  version: string
  lastSyncedAt: Date
}
```

- **本地 Skill**：直接读取 `src/agents/skills/` 下的 Markdown 文件
- **GitHub Skill**：支持从公开 GitHub repo 拉取 SKILL.md（定期同步）
- **URL Skill**：从任意 HTTPS URL 拉取（需管理员审核白名单）

> ⚠️ 外部 Skill 安全限制：只读 Markdown 格式，不允许执行代码，注入前做内容过滤

#### 2.3 Skill 注入时机

```typescript
// copywriter.ts 调用流程升级
const skill = await loadPlatformSkill(platform)  // 动态加载
const hookPrompt = buildHookPrompt({
  ...baseContext,
  skillInstructions: skill.instructions,   // 注入 Skill 内容
  hookFormulas: skill.hookFormulas,        // 注入平台专属公式
  examples: skill.examples,               // 注入 Few-shot 样本
})
```

---

### 需求 3 — 内部知识库（Internal Knowledge Base）

**目标**：将经过检验的优质内容（模板、样本、品牌语言）沉淀为结构化知识，供生成时检索。

#### 3.1 知识库分层设计

```
Level 1 — 平台公共知识（Platform Commons）
  ├── 各平台格式规范（字数/emoji/换行规则）
  ├── 验证过的 Hook 公式库（按效果打分）
  └── 本地生活行业词汇表（餐饮、美业、健身、家装、宠物、教育、诊所、零售等）

Level 2 — 品牌私有知识（Brand Private）
  ├── 品牌语气模板（BrandKnowledge 现有）
  ├── 人工修改后的爆文样本（UserCorrectionFeedback 现有）
  └── 历史高表现帖子（按互动率排序）

Level 3 — 动态生成知识（Generated）
  ├── CopywriterLog 记录（每次生成的 prompt + output）
  └── 自动提炼的「最优写法」（定期蒸馏任务）
```

#### 3.1.1 本地生活行业族群（Local Lifestyle Verticals）

AIERA 的 KnowledgeEntry 与 Format Skill 必须按“本地生活”行业族群组织，而不是按餐饮单行业组织。每个行业族群至少包含：核心顾客意图、常见 offer 类型、可信证明、本地化 CTA、禁忌表达和高表现样例。

| industryVertical | 覆盖商户 | 典型顾客意图 | 内容重点 |
|------------------|----------|--------------|----------|
| `food_beverage` | 餐厅、咖啡、酒吧、烘焙、档口 | 想吃什么、去哪吃、有什么优惠 | 菜品/体验/位置/预约/堂食外卖 |
| `beauty_wellness` | 美甲、美睫、美容、SPA、按摩 | 变美、放松、修复、节日护理 | 前后对比、服务流程、卫生安全、套餐 |
| `fitness_pilates` | 健身房、普拉提、瑜伽、私教 | 改善体态、减脂、塑形、试课 | 训练收益、教练资质、体验课、会员转化 |
| `home_renovation` | 装修、维修、清洁、空调、水电 | 解决家庭问题、提升空间 | 案例前后对比、工艺、报价透明、预约上门 |
| `pet_services` | 宠物美容、寄养、训练、兽医周边 | 宠物健康、护理、安全托管 | 宠物友好、护理细节、环境可信、预约 |
| `education_training` | 补习、语言、音乐、儿童课程 | 提升成绩/技能、试听、报名 | 学习成果、师资、课程体系、试听 CTA |
| `healthcare_clinic` | 牙科、理疗、皮肤管理、诊所 | 安全、专业、预约咨询 | 合规表达、资质、流程说明、风险避免 |
| `retail_specialty` | 花店、礼品、酒水、精品零售 | 购买礼物、节日需求、本地配送 | 商品亮点、场景化、限时款、到店/配送 |
| `events_entertainment` | KTV、密室、亲子活动、工作坊 | 周末去处、聚会、体验 | 活动氛围、人数/时间/价格、预订 |
| `professional_services` | 摄影、会计、法律、设计、顾问 | 解决专业问题、建立信任 | 案例、专业可信、咨询 CTA、合规边界 |
| `general_local_service` | 无法归类的新本地服务 | 发现、了解、咨询 | 先走通用本地服务框架，再沉淀垂类知识 |

**实现要求：**
- `industryVertical` 来自 BrandKnowledge、品牌描述、历史内容和用户 brief 的综合判断。
- 若无法判断行业，默认 `general_local_service`，不允许默认写成餐饮。
- Platform Skill 只回答“这个平台怎么写”；Vertical Skill 回答“这个行业该强调什么”。
- Quality Gate 必须根据行业切换禁忌项。例如诊所/健康护理避免夸大疗效，家装避免虚假最低价，美业避免不实前后对比。

#### 3.2 知识库存储方案

**当前阶段（v2.0）**：使用 PostgreSQL + 向量化

```sql
-- 新增表: KnowledgeEntry
CREATE TABLE knowledge_entries (
  id          TEXT PRIMARY KEY,
  level       TEXT,              -- 'platform' | 'brand' | 'generated'
  platform    TEXT,
  brand_id    TEXT,              -- NULL = 全平台通用
  category    TEXT,              -- 'hook' | 'template' | 'example' | 'format_rule'
  title       TEXT,
  content     TEXT,
  embedding   vector(768),       -- pgvector, Gemini embedding
  quality_score FLOAT,           -- 0-1, 人工或 LLM 评分
  usage_count INTEGER DEFAULT 0,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
);
```

**检索方式**：
- 简单检索：按 `platform + category` 过滤
- 语义检索：`embedding <=> query_embedding` cosine similarity（pgvector）

#### 3.3 知识入库流程

```
人工修改帖子
    ↓
UserCorrectionFeedback 表 (已有)
    ↓ 每日定时任务
质量评估 (LLM-as-Judge)
    ↓ 通过评分阈值
写入 KnowledgeEntry
    ↓
生成 embedding
    ↓
可供下次生成检索
```

#### 3.4 Admin 知识库管理 UI

- 在 `/admin` 页增加"知识库管理"面板
- 功能：增删改查 KnowledgeEntry，手动打分，批量导入模板
- 支持从 CopywriterLog 中批量提升优质输出为知识条目

---

### 需求 4 — 平台专属 Skill（Platform Skills）

**目标**：将每个平台的创作规范写成独立 Skill，形成可维护、可迭代的创作标准。

#### 4.1 每个平台 Skill 包含

```markdown
# SKILL: 小红书创作规范 v1.2

## 平台特性
- 主要用户：18-35岁女性，一二线城市
- 核心驱动：种草 + SEO 搜索 + 收藏导向
- 内容形式：图文为主，视频为辅

## Hook 公式库（5类，每类3条）
[Category A - 惊喜/震惊]
...

## 正文格式规范
- 最大字数：1000字（超出截断）
- 段落：每段1-2句，空行分隔
- Emoji 密度：每段至少1个
- 禁用 Markdown 格式（##、**）
- 地址必须以 📍 开头

## 标签策略
- 主话题 1个（#新加坡美食）
- 长尾 2-3个（#克拉码头探店）
- 品牌词 1个
- 总计不超过10个

## Few-Shot 样本
[成功案例 1]...
[成功案例 2]...

## 禁忌词
- 违禁词：最好/第一/专业/...
- AI 味词：直接封神/我不允许/封神...
```

#### 4.2 各平台 Skill 差异对比

| 维度 | 小红书 | Instagram | TikTok | Facebook | Google Business |
|------|--------|-----------|--------|----------|-----------------|
| 语言 | 中文 | 英文 | 英文 | 英文 | 英文 |
| 重点 | 种草/SEO | 视觉/故事 | 前3秒钩子 | 社区互动 | 专业/本地 |
| 字数上限 | 1000 | 2200 | 300（caption） | 无限制 | 1500 |
| Emoji 风格 | 高密度装饰 | 少量点缀 | 无/少 | 适中 | 极少 |
| CTA 风格 | 收藏/点赞引导 | 链接跳转 | 评论挑战 | 分享/参与 | 预约/联系 |
| Hashtag | 底部#标签 | 底部话题 | 内嵌 | 2-3个 | 不使用 |

---

### 需求 5 — 高并发架构（Queue + Worker）

**目标**：支持未来 100+ 品牌同时使用 Copywriter，不互相阻塞。

#### 5.1 当前问题

```
当前 (同步):
API Request → copywriterNode() → callLLM() (3-8秒) → Response
问题: 每个请求阻塞 Next.js serverless 线程，10个并发就会超时
```

#### 5.2 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Client / API Layer                      │
│  POST /api/brands/:id/copywriter                            │
│  → validate → enqueue job → return { jobId, status: 'queued' }│
└─────────────────────┬───────────────────────────────────────┘
                      │ BullMQ Job
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Redis Queue Layer                          │
│  Queue: amc:copywriter:{priority}                           │
│  ├── high-priority (手动触发)                               │
│  ├── normal (AI agent 触发)                                 │
│  └── batch (批量生成)                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ Worker Pull
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Worker Pool (可水平扩展)                   │
│  Worker 1: concurrency=5 (I/O密集，LLM调用)                │
│  Worker 2: concurrency=5                                    │
│  Worker N: concurrency=5                                    │
│                                                             │
│  每个 Worker 执行:                                          │
│  Stage0 (意图理解) → Stage1 (Hooks) → Stage2 (Body)        │
└─────────────────────┬───────────────────────────────────────┘
                      │ Result
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Notification Layer                         │
│  ├── WebSocket / SSE → 实时推送到前端                       │
│  ├── Lark 通知 → 告知品牌主内容已就绪                       │
│  └── DB 更新 → ContentDraft.status = 'draft'               │
└─────────────────────────────────────────────────────────────┘
```

#### 5.3 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Queue | **BullMQ** | TypeScript-first，支持 Flow（依赖链），Render 支持 |
| Broker | **Redis** (Render Redis) | 现有基础设施，BullMQ 依赖 |
| Worker | **独立 Node.js 进程** | 可单独 scale，与 Next.js 解耦 |
| 监控 | **Bull Board** | 实时队列状态 UI |

#### 5.4 分阶段实施

- **v2.0（短期）**：保持同步，加入 timeout 保护 + retry 机制
- **v2.1（中期）**：引入 BullMQ，Worker 与 Next.js 同进程但异步
- **v2.2（长期）**：Worker 独立部署，Render 上单独 Worker service

#### 5.5 成本估算（并发性能目标）

| 规模 | 品牌数 | QPS（峰值） | 所需 Worker | Redis 内存 |
|------|--------|------------|------------|------------|
| 当前 | ~10 | 0.1 | 1 (内嵌) | 无 |
| v2.1 | 50 | 1 | 1 Worker × 5并发 | 256MB |
| v2.2 | 200 | 5 | 3 Worker × 5并发 | 1GB |
| 远期 | 1000 | 20 | K8s + 动态扩容 | Redis Cluster |

---

### 需求 6 — 图生视频 + 视频脚本创作

**目标**：让 AI 能从品牌图片自动生成短视频素材，并为视频创作配套脚本。

#### 6.1 整体能力架构

```
输入: 品牌图片 (MediaAsset) + 主题 (theme) + 平台 (TikTok/Reels/XHS)
                    ↓
         [Script Writer Agent]      ← 新增
                    ↓
         视频脚本 (Scene × N)
         每个 Scene: 镜头描述 + 旁白文字 + 时长
                    ↓
         [Video Generator] (Kling / Runway)
                    ↓
         生成视频 URL (存 OBS)
                    ↓
         回传 ContentDraft (mediaUrls 包含视频)
```

#### 6.2 视频脚本创作（Script Writer Agent）

```typescript
// 新增 Agent Node: scriptWriter.ts
interface VideoScript {
  platform: 'tiktok' | 'instagram_reels' | 'xiaohongshu'
  totalDuration: number      // 秒
  aspectRatio: '9:16' | '1:1' | '16:9'
  scenes: VideoScene[]
  voiceover?: string         // 完整旁白文案
  caption: string            // 发布文案
  hashtags: string[]
}

interface VideoScene {
  index: number
  duration: number           // 秒（通常3-5秒/场）
  imageSource: string        // MediaAsset URL（作为起始帧）
  motionPrompt: string       // 给 Seedance 的动效描述（英文）
  voiceover?: string         // 当前场景旁白（可选，Script Writer 生成）
  textOverlay?: string       // 字幕文字
  transitionType?: string    // 'fade' | 'cut' | 'zoom'
  seedanceParams?: {         // Seedance 专属参数
    resolution: '480p' | '720p' | '1080p' | '4K'
    duration: number         // 秒（3-8秒/场）
    motionIntensity?: 'low' | 'medium' | 'high'
  }
}
```

**脚本类型（按平台优化）**：

| 平台 | 时长 | 场景数 | 节奏风格 | 推荐分辨率 |
|------|------|--------|---------|----------|
| TikTok | 15-30s | 5-8 scenes | 快切，前3秒必须是钩子 | 1080p (9:16) |
| Instagram Reels | 15-60s | 5-12 scenes | 视觉美学，品牌调性 | 1080p (9:16) |
| 小红书视频 | 30-90s | 8-15 scenes | 种草节奏，产品展示 | 1080p (9:16) |

#### 6.3 图生视频引擎选型 ✅ 已决策

> **决策**：使用 **Seedance（ByteDance / BytePlus ModelArk）** 作为唯一视频生成引擎。

**选型理由**：
- ByteDance 出品，在亚洲内容（中餐/本地商家）上的运动风格与 XHS/TikTok 平台审美天然契合
- 支持多模态输入（图片作为首帧 + 文字 prompt 控制动效）
- Seedance 2.0 支持原生音视频联合生成（为未来 TTS 旁白预留接口）
- Seedance 2.5 支持 4K、30秒、最多50个多模态参考帧（为未来品牌一致性留足升级空间）

**API 接入方案**：
- 官方渠道：**BytePlus ModelArk** (`console.byteplus.com`)
- API 类型：异步任务制（提交 → 轮询 → 获取结果 URL）
- API 密钥：存入 `SystemConfig.seedanceApiKey`（遵循现有 SystemConfig 规范）

**定价结构（Seedance 2.0）**：

| 分辨率 | 估算成本/秒 | 5秒视频 | 30秒视频 |
|--------|-----------|--------|--------|
| 480p | ~$0.005/s | ~$0.03 | ~$0.15 |
| 720p | ~$0.01/s | ~$0.05 | ~$0.30 |
| 1080p | ~$0.025/s | ~$0.13 | ~$0.75 |
| 4K | ~$0.06/s | ~$0.30 | ~$1.80 |

> ℹ️ 以上为基于 BytePlus token 定价的估算值，实际费用依 ModelArk 控制台价格为准

**版本策略**：
- **当前集成**：Seedance 2.0（稳定，API 文档齐全）
- **未来升级**：Seedance 2.5（4K + 30秒长视频，待 API GA 后切换）

#### 6.4 视频生成工作流 ✅ 已决策（用户主动触发）

```
触发条件：用户在 PostEditDrawer 点击「生成视频版本」按钮（手动触发）

步骤 1: 用户点击「生成视频」按钮
步骤 2: 系统即时计算成本预估并显示弹窗：
        ┌─────────────────────────────────────┐
        │  🎬 视频生成预估                     │
        │  场景数：6 scenes × 5s = 30s 总时长  │
        │  分辨率：1080p                       │
        │  预计成本：约 $0.75（Seedance API）  │
        │  预计时间：3-5 分钟                  │
        │  [取消]              [确认生成]       │
        └─────────────────────────────────────┘
步骤 3: 用户确认后，Script Writer Agent 生成视频脚本（2-5秒）
步骤 4: 用户预览脚本分镜，可手动编辑每个 Scene 的 motionPrompt（可选）
步骤 5: 提交到 BullMQ 队列，并发调用 Seedance API（每个 Scene 并行）
步骤 6: 轮询 Seedance 任务状态（每个 Scene 约 60-120 秒）
步骤 7: 所有 Scene 完成后，服务端用 FFmpeg 拼接视频片段
步骤 8: 上传到 OBS，回传 MediaAsset
步骤 9: 关联到 ContentDraft，通知用户「视频已就绪，可预览」
步骤 10: 用户在 PostPreviewModal 预览视频版本，可选择发布

注意：视频生成期间用户可继续其他操作，完成后通过 SSE 实时通知。
```

#### 6.5 新增 DB Schema

```sql
-- 视频脚本表
CREATE TABLE video_scripts (
  id            TEXT PRIMARY KEY,
  brand_id      TEXT,
  draft_id      TEXT,          -- 关联 ContentDraft
  platform      TEXT,
  script_json   JSONB,         -- VideoScript 完整结构
  status        TEXT,          -- 'draft' | 'generating' | 'done' | 'failed'
  total_cost    FLOAT,         -- API 调用成本（美分）
  created_at    TIMESTAMP
);

-- 视频生成任务表
CREATE TABLE video_generation_jobs (
  id            TEXT PRIMARY KEY,
  script_id     TEXT,
  scene_index   INTEGER,
  engine        TEXT DEFAULT 'seedance',  -- 'seedance' | (future: 可扩展)
  engine_version TEXT DEFAULT '2.0',      -- 'seedance-2.0' | 'seedance-2.5'
  resolution    TEXT DEFAULT '1080p',
  duration_sec  INTEGER,
  input_image   TEXT,          -- 起始帧 URL（MediaAsset URL）
  motion_prompt TEXT,          -- 动效描述（英文，给 Seedance）
  output_url    TEXT,          -- 生成视频 URL（OBS）
  token_consumed INTEGER,      -- Seedance token 消耗量
  cost_cents    INTEGER,       -- 实际成本（美分）
  status        TEXT,
  error         TEXT,
  created_at    TIMESTAMP
);
```

---

## 四、系统架构总图

```
┌──────────────────────────────────────────────────────────────────┐
│                    AIERA v2 内容生产引擎                           │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                   Skill Layer (可插拔)                       │  │
│  │  LocalSkill | GitHubSkill | URLSkill                        │  │
│  │  platform/xiaohongshu | platform/instagram | formats/*      │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │ inject                                   │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │                Knowledge Base (RAG)                          │  │
│  │  KnowledgeEntry (pgvector) | UserCorrectionFeedback | BrandKB│  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │ retrieve                                 │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │              Copywriter Pipeline (4-Stage)                   │  │
│  │  [Brief] → [Hook Competition] → [Body] → [Quality Gate]      │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │ result                                   │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │              Script Writer (新增)                            │  │
│  │  VideoScript Generator → Scene × N → FFmpeg Assembly        │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │                                          │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │    Image-to-Video Engine: Seedance 2.0 (BytePlus ModelArk)   │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │                                          │
│  ┌──────────────────────▼──────────────────────────────────────┐  │
│  │       Queue & Worker (BullMQ + Redis) — 高并发层              │  │
│  │  Priority Queues | Horizontal Workers | Bull Board Monitor   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.1 `amc-content` Package 边界（已开始实施）

AIERA v2 的内容生成核心统一沉淀为本地 package：`packages/amc-content`。该 package 供 `amc-kanban` 调用，但不直接依赖 Next.js Route、Prisma、Session、Capability 或发布系统。

**职责边界：**

| 模块 | 负责 |
|------|------|
| `packages/amc-content` | 内容生成核心逻辑、平台策略、行业策略、质量门禁、知识检索接口、生成 provenance |
| `amc-kanban` | 鉴权、品牌权限、DB 读取写入、Job/Worker、ContentDraft/ActionItem、发布与通知 |

**首批目录结构：**

```
packages/amc-content/
  src/
    types.ts
    pipeline/createPlatformContent.ts
    platforms/
      base.ts
      registry.ts
    verticals/
      registry.ts
    quality/
      deterministicGate.ts
```

**调用方式：**

```typescript
import { createPlatformContent } from 'amc-content'

const result = await createPlatformContent({
  brand,
  brief,
  platform: 'xiaohongshu',
  media,
  adapters: {
    modelRouter,
    knowledgeRepository,
    logger,
  },
})
```

**设计原则：**
- `amc-content` 只定义 adapter interface，不直接 import `prisma` 或 `callLLM`。
- `amc-kanban` 提供 `modelRouter`、`knowledgeRepository`、`logger` 的具体实现。
- 平台差异走 `PlatformContentProvider`，行业差异走 `VerticalSpec`。
- 后续 BullMQ/Worker 只需调用同一个 `createPlatformContent()` 入口。

---

## 五、实施路线图

### Phase 1 — 基础能力升级 ✅ 已完成
- [x] Option A：Hook 多样化 + 随机选取
- [x] 各平台 Skill 文件（xiaohongshu/instagram/tiktok/facebook/google_business）
- [x] Skill 动态加载器（`skillLoader.ts`）
- [x] Copywriter 集成 Skill 注入（Hook 阶段 + Body 阶段）

### Phase 2A — Copywriter 质量闭环（1-2周，下一步优先）
- [x] 建立 `packages/amc-content` package 骨架
- [x] 定义 `PlatformType`、`IndustryVertical`、`CopyBrief`、`PlatformContentResult`、`QualityResult` 等核心类型
- [x] 建立 `PlatformContentProvider` registry（xiaohongshu / instagram / facebook / google_business / tiktok）
- [x] 建立 `VerticalSpec` registry（本地生活行业族群）
- [x] 建立 deterministic Quality Gate 初版（长度、hashtag、禁词、必填字段、media rules、行业合规基础项）
- [ ] `Brief Normalizer`：将用户创意、素材、任务说明结构化为 `CopyBrief`
  - `industryVertical` / `offerType` / `customerIntent` / `theme` / `angle` / `targetEmotion` / `contentType` / `mustMention` / `mustAvoid` / `locationFocus` / `localProof`
- [ ] `Vertical Skill` 基础包：建立本地生活行业族群 Skill，不再把餐饮作为默认行业
  - `food_beverage`
  - `beauty_wellness`
  - `fitness_pilates`
  - `home_renovation`
  - `pet_services`
  - `education_training`
  - `healthcare_clinic`
  - `retail_specialty`
  - `events_entertainment`
  - `professional_services`
  - `general_local_service`
- [ ] Hook 候选结构升级：从 `string[]` 改为 `HookCandidate[]`
  ```typescript
  interface HookCandidate {
    text: string
    category: 'surprise' | 'geo' | 'fomo' | 'pain_point' | 'counter_intuitive' | 'benefit' | 'social_proof'
    score: number
    reason: string
  }
  ```
- [ ] Hook 选择器：按 score 加权选择，并排除最近 10 篇同品牌同平台重复 category 或相似开头
- [ ] `Quality Gate`：新增 `src/agents/nodes/copywriterQualityGate.ts`
  - AI 腔词汇检测
  - Platform Skill 格式校验
  - BrandKnowledge `negPrompts` 校验
  - GBP 地址/联系方式必填、小红书标签数量、Instagram 首 125 字符等平台规则
- [ ] 自动重写一次：Quality Gate 未通过时，把 `reasons[]` 转为 `rewriteInstruction` 重新调用 Body Composer
- [ ] 审计增强：CopywriterLog 必须写入 `draftId`、`platform`、`promptVersion`、`modelId`、`rawOutput`；失败也记录降级原因
- [ ] 人工反馈闭环：确认发布或人工修改后，继续复用 `processDraftCuration()` 写入 `CopywriterLog.correctedContent` 与 `UserCorrectionFeedback`
- [ ] Admin 标注工作台增强：在 CopywriterLogPanel 中展示 `qualityScore`、失败原因和 “Promote to Knowledge” 操作入口

### Phase 2B — 知识库建立（3-4周）
- [ ] KnowledgeEntry 表 + pgvector 扩展（Render Postgres）
- [ ] 从 UserCorrectionFeedback 自动提炼候选知识（AI 评分）
- [ ] Admin 知识库管理 UI（/admin 页新 panel）
  - 候选内容列表，人工打分（1-5星，≥0.7 = 4星+才入库）
  - 批量导入模板功能
- [ ] 语义检索替代 Jaccard（cosine similarity via pgvector）

### Phase 3 — 并发架构（2-3周）
- [ ] BullMQ + Redis 集成（Render Redis 已有）
- [ ] Worker 进程与 Next.js 分离（独立 Render Service）
- [ ] SSE 实时状态推送到前端
- [ ] Bull Board 监控面板（/admin/queues）

### Phase 4 — 视频能力（4-6周）
- [ ] Script Writer Agent 节点（新增 `scriptWriter.ts`）
- [ ] **Seedance 2.0 API 集成**（BytePlus ModelArk）
  - API 密钥配置：Admin UI → `SystemConfig.seedanceApiKey`
  - 异步任务轮询机制（submit → poll → retrieve）
- [ ] VideoScript/VideoGenerationJob DB 表（Prisma schema）
- [ ] PostEditDrawer UI — 「生成视频」按钮 + 成本预估弹窗
- [ ] 分镜预览 + 手动编辑 motionPrompt
- [ ] FFmpeg 视频拼接（服务端）
- [ ] OBS 上传 + PostPreviewModal 视频预览
- [ ] 视频审批 + 发布流程

---

## 六、设计决策记录

| # | 问题 | 决策 | 日期 |
|---|------|------|------|
| Q1 | Skill 文件存储方式 | **Markdown 文件系统**（`src/agents/skills/platforms/`），不进 DB | 2026-07-04 |
| Q2 | 视频生成触发方式 | **用户主动触发** + 生成前显示成本预估弹窗 | 2026-07-04 |
| Q3 | 知识库审核机制 | **AI 自动收录候选** + 人工 Admin 评分，≥ 0.7（4星+）才正式入库 | 2026-07-04 |
| Q4 | 视频生成引擎 | **Seedance（ByteDance / BytePlus ModelArk）** — 替代 Kling/Runway/Pika | 2026-07-04 |
| Q5 | 视频旁白 TTS | 暂不集成，Seedance 2.0 支持原生音视频联合生成，未来直接用 Seedance 能力 | 2026-07-04 |
| Q6 | Skill 安全沙箱 | 仅允许 Markdown 格式，禁止可执行代码，未来视需求再评估 | 2026-07-04 |
| Q7 | 下一步优先级 | 开场白已达当前要求；优先进入 **Phase 2A Copywriter 质量闭环**，暂缓队列、微调、视频主链路 | 2026-07-04 |
| Q8 | 外部 Skill | 短期只启用本地 Markdown Skill；GitHub/URL Skill 保留设计但不进入 Phase 2A | 2026-07-04 |
| Q9 | 主体行业定位 | AMC 主体行业为**本地生活**，餐饮只是高频垂类；核心 Copywriter 不允许默认写死餐饮语境 | 2026-07-04 |

---

## 七、Seedance API 集成设计

### 7.1 API 端点（BytePlus ModelArk）

```typescript
// 核心 API 流程（异步任务制）
const BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'

// Step 1: 提交视频生成任务
POST /contents/generations/tasks
{
  model: 'seedance-1-0-lite-i2v-250528',  // 或 seedance-1-0-i2v-250528 (Pro)
  content: [
    { type: 'image_url', image_url: { url: inputImageUrl } },  // 首帧
    { type: 'text', text: motionPrompt }                        // 动效描述
  ]
}
// 返回: { id: 'task_xxx', status: 'queued' }

// Step 2: 轮询任务状态（每 10 秒）
GET /contents/generations/tasks/{task_id}
// 返回: { status: 'processing' | 'succeeded' | 'failed', content: [...] }

// Step 3: 获取视频 URL
// status='succeeded' 时，content[0].video_url = '生成视频的临时 URL'
// 需立即下载并上传到 OBS（URL 有效期有限）
```

### 7.2 成本计算公式

```typescript
// Seedance Token 计算
const tokenConsumed = (outputWidth * outputHeight * outputFrameRate * outputDuration) / 1024
const costUSD = tokenConsumed * tokenUnitPrice

// 前端成本预估（用户确认弹窗）
function estimateCost(scenes: VideoScene[]): CostEstimate {
  const totalSeconds = scenes.reduce((sum, s) => sum + s.duration, 0)
  const resolution = scenes[0].seedanceParams?.resolution ?? '1080p'
  const ratePerSec = SEEDANCE_RATE_TABLE[resolution]  // 从 SystemConfig 读
  return {
    totalSeconds,
    estimatedCostUSD: totalSeconds * ratePerSec,
    estimatedMinutes: Math.ceil(totalSeconds * 2.5 / 60)  // 约 2.5x 实时
  }
}
```

### 7.3 Admin 配置项（SystemConfig）

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `seedanceApiKey` | string | BytePlus ModelArk API Key |
| `seedanceModelId` | string | 默认 `seedance-1-0-lite-i2v-250528` |
| `seedanceDefaultResolution` | enum | 默认 `1080p` |
| `seedanceCostPerToken` | number | 单位 token 价格（从 BytePlus 控制台获取）|
| `seedanceMaxCostPerVideo` | number | 单次视频生成成本上限（美分），超出拒绝生成 |
