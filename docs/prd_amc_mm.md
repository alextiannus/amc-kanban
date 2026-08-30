# AMC-MM 品牌主端产品需求文档 (PRD)

## 店内抽奖固定二维码（当前规则）

- 每个品牌固定使用 `https://amc-kanban.immedi.ai/game/{brandId}`，二维码不包含奖品 ID、配置 ID、时间戳或版本。
- 奖品、概率、库存、海报文案或主题保存后立即对新访问生效，已经打印的贴纸无需更换。
- 页面必须明确提示商家“固定二维码，更换奖品无需重新打印”，二维码本身使用固定黑白渲染参数。
- 已经抽中的奖品按中奖时快照展示和核销；奖品名称或类型改变时视为新奖品并从零开始库存与计数。
- 商家可为固定二维码配置多轮活动起止时间；轮次按品牌时区自动生效且不得重叠。新建轮次允许开始时间早于当前时间，只要结束时间仍在未来，保存后立即生效；没有生效轮次时顾客活动暂停。
- 生效轮次内，顾客首次复制并打开 Google、小红书或 Instagram 中任一平台即获得 5 积分；每个轮次和匿名浏览器 session 只发一次，不验证是否公开发布。
- 开始新轮次只恢复领分资格，不清空积分、每日抽奖次数、奖品库存、中奖或兑奖历史。
- 顾客文案从 Kanban 后台预生成池即时租用，中文、英文各维持 5 组；公开页面不等待 AI。点击并领分成功后才消费文案，随后异步补 1 组；空池即时返回安全基础模板。
- 顾客页使用本地化 CTA“立即评价，获取积分抽奖”/“Review now, earn points, and spin to win”，不展示数据库中文活动说明；保留可编辑平台文本框，移除 Prepare、生成次数、AI/fallback 提示和确认框。
- Kanban 店内活动设置展示中英文库存、锁定数、生成状态、最近生成/错误，并支持手动补充至 5 组；保存配置、调整平台或创建轮次后自动排队补充。
- 顾客中奖后可在中奖结果或历史奖品卡片一键“立即使用 / Use now”，无需店员 PIN 或二次确认。核销在服务端按品牌、匿名 session 和 `spinLogId` 原子完成且不可撤销；已使用记录保留奖品名称和核销时间，但隐藏完整兑换码。店员 PIN 查询/核销继续可用，并与顾客端共享同一防重复状态。

> **版本**: v1.2  
> **日期**: 2026-07-02  
> **作者**: Antigravity  
> **状态**: 基础 UI/UX 优化迭代中

### 修订记录 (Changelog)

| 版本号 | 日期 | 修订内容 | 变更说明 |
|--------|------|----------|----------|
| v1.0 | 2026-06-27 | 初版 PRD 确立 | 历史版本记录 |
| v1.1 | 2026-07-02 | 对齐主站订阅 API 契约 | 新品牌注册和续订逻辑调整为“先订阅”，集成 Stripe 支付确认及多设备重定向修复，对齐支付字段为 paymentMode（兼容 paymentMethod） |
| v1.2 | 2026-07-02 | 顶部及右侧抽屉导航 UI/UX 优化 | 1. 无品牌时，左上角文案由 "AI Staff" 调整为 "AMC"；2. 右侧菜单中，将信息套餐和品牌信息合并展示于顶部组件；3. 底部原订阅套餐卡片替换为“用户设置”入口，支持点击修改注册信息。 |
| v1.3 | 2026-07-02 | 优化数据库事务防止 500 异常 | 优化品牌与订阅创建流程中的 Prisma 事务范围，将非核心元数据写入移至事务外部，彻底消除在高网络延迟下的 5 秒事务超时（P2028）报错。 |
| v1.21 | 2026-07-03 | 修复品牌注册挂起 25 秒根本原因 + 移除 Azure/Maps 依赖 | **根本原因**：`bcryptjs`（纯 JS bcrypt）在 Render 限速 CPU 上 cost=12 阻塞 Node.js 事件循环 15-30 秒，导致 `/api/mm/subscription` POST 全程无响应。修复：cost factor 12→8，临时密码（从不直接使用）用 8 轮已足够安全。**同步移除**：(1) Azure Speech 集成（`/api/mm/speech-token`、useCompanionLive、useVoiceCompanion 改为始终返回 null → 降级 Web Speech API）；(2) Google Maps Places Autocomplete（地址改为纯文本输入，用户自行粘贴 Google Maps 链接）；(3) amc-mm 所有 maps-config/speech-token proxy 路由改为即时 503（Cache-Control: 24h），不再触达 kanban。影响文件：`brandOwnerAccount.ts`、`BrandOwnerDashboard.tsx`、`useCompanionLive.ts`、`useVoiceCompanion.ts`、`proxy.ts`、`api/maps-config/route.ts`、`api/mm/speech-token/route.ts`。 |
| v1.22 | 2026-07-29 | Growth 统一商家数据中心接入 | MM 继续作为商家 UI/BFF：订阅、工作与审批走 Kanban；商家资料、分类和知识补充按 Kanban 返回的 `growthBrandKey` 读取 Growth，并以候选方式提交 Growth。MM 不保存独立商家知识副本，当前阶段不接 POS。 |

## Growth 商家数据中心边界（当前方案）

- MM 获取品牌列表和访问权限时仍以 Kanban 为准，同时读取品牌的 `growthBrandKey`。
- 品牌资料和已发布知识分别由 Growth 的 profile、knowledge API 提供；页面可组合显示，但不得把 Growth 响应静默写回 Kanban 形成第二份主数据。
- 商家编辑资料或补充知识时，MM 将修改作为 `merchant_confirmed` 来源的知识候选提交 Growth。需要审核的字段保持候选态；已发布知识只通过 Growth 的审核/版本机制变化。
- 若旧品牌尚无 `growthBrandKey`，MM 显示“数据中心未绑定”，由 Kanban 重试绑定或管理员迁移；禁止恢复名称模糊匹配。
- Content、Kanban、MM 均只通过受控 API 消费 Growth，不直接访问 Growth 数据库。

## BD 销售线索录入与 ERP 状态（当前目标，待本次变更发布）

- 具有 `BD` 角色的用户可在 AMC-MM 录入本人销售线索并查看 90 天有效期内的未转化记录；Admin 可从管理身份执行同一流程。
- 提交成功分为两种明确结果：`ERP 已同步`，或“Kanban 已保存、ERP 同步失败/待重试”。只有前者可以显示完整成功提示。
- 每张线索卡展示 ERP 同步状态；同步成功时显示 ERP Lead 编号，失败时显示安全错误提示和“重试同步”按钮。重试期间按钮禁用，结果刷新当前列表。
- 重试只同步现有 Kanban 线索，不再次创建本地线索；非线索所有者的 BD 不得重试。
- AMC-MM 仅作为 BFF/UI 使用 Kanban 接口，不持有 Immedi ERP API Key，也不直接请求 ERP。

---

## 一、产品定位

**AMC-MM（AI Marketing Companion — Merchant Mode）** 是 AI Marketing Crew 为品牌主设计的移动端专属应用。

### 核心理念

> **"AI 员工，而非软件工具"**

品牌主不是在"使用一个 App"，而是在**与一名专属的 AI 营销员工对话**。这名员工了解品牌的菜单、语气、受众和历史内容，能够主动汇报工作状态，接受指令并执行操作。

### 与 AMC 主系统（工作人员端）的关系

| 维度 | AMC 主系统 | AMC-MM |
|------|-----------|--------|
| 目标用户 | 营销团队/代理 | 品牌主（餐饮老板等） |
| 操作深度 | 精细化管理 | 对话式指令 |
| 界面风格 | 看板/管理台 | 移动优先 AI 对话 |
| 使用频率 | 日常高频 | 碎片化/随时随地 |

---

## 二、用户画像

**典型用户**：连锁餐饮品牌主、独立餐厅老板  
**使用场景**：
- 在店内查看今日内容情况
- 出行途中语音指令 AI 生成内容
- 下班后快速审批 AI 准备好的帖子
- 随时了解品牌内容健康状态

**核心痛点**：
- 没有时间学习复杂的营销软件
- 需要随时知道"内容发没发、效果怎么样"
- 希望 AI 自动处理大部分事情，只在关键节点需要自己确认

---

## 三、设计原则

1. **AI 优先**：所有操作都可以通过对话触达，功能模块是对话的可视化辅助
2. **主动汇报**：AI 主动说话，不等用户问
3. **最少点击**：审批、确认类操作应在对话流中完成，无需跳转
4. **移动优先**：设计以手机竖屏为基准，所有交互适配拇指操作区

---

## 四、核心功能模块（按优先级排序）

---

### 🅰️ P0 — 功能 A：AI 查询（实时数据问答）

**描述**：AI 伴侣能够回答品牌主关于内容状态、发布记录的实时查询问题。

**支持的查询类型**：

| 用户说的话 | AI 需要调用的数据源 | 回答示例 |
|-----------|-----------------|---------|
| "今天排了几篇内容？" | `/api/dashboard/calendar` | "今天有 2 篇内容排期，分别是小红书下午 2 点和 Instagram 晚上 7 点。" |
| "小红书上次是什么时候发的？" | `/api/dashboard/brand-activity` | "小红书上次发布是 3 天前，已经有点久了，要我帮你写一篇吗？" |
| "有没有待我审核的草稿？" | `/api/brands/[id]/actions` | "有 2 篇草稿等待您确认，分别是周末特惠和新品介绍，我来念给您听吗？" |
| "这个月发了多少篇？" | `/api/dashboard/calendar` | "本月共发布了 12 篇内容，其中小红书 5 篇、Instagram 4 篇、Google 3 篇。" |

**技术要求**：
- AI 后端支持 **Tool-call 模式**（Function Calling）
- 定义查询工具函数：`get_calendar_events`、`get_action_items`、`get_brand_activity`
- AI 根据用户意图决定调用哪个工具，获取数据后以自然语言返回

**验收标准**：
- [ ] 用户问任何关于"今天/本周/上次"内容状态的问题，AI 能给出正确答案
- [ ] AI 在查询数据时不超过 3 秒响应
- [ ] AI 回答长度适合语音播报（不超过 3 句话）

---

### 🅳 P0 — 功能 D：主动开场白（Proactive AI Greeting）

**描述**：每次品牌主打开 AMC-MM，AI 伴侣**主动开口说话**，汇报当前最重要的工作状态，无需用户主动提问。

**开场白逻辑**（优先级检查顺序，取前 1-2 条拼成开场白）：

```
1. 🔴 有待审批草稿（ActionItems pending）
   → "老板好，有 X 篇内容准备好了等您确认。"

2. 🟡 品牌内容健康异常（某平台超过 3 天未发布）
   → "另外，[平台] 已经 X 天没更新了，要我帮您写一篇吗？"

3. 🟢 今日排期提醒
   → "今天 [时间] 有一篇 [平台] 内容将自动发布。"

4. ⚪ 无特别事项
   → "一切正常，今日暂无待处理事项。有什么需要我帮忙的吗？"
```

**个性化**：
- 开场白使用品牌名称
- 根据品牌 tone of voice 调整说话风格（正式/活泼）
- 时段感知：早上/下午/晚上使用不同问候语

**触发时机**：
- 页面首次加载时（每次打开 app）
- 用户在主界面停留超过 30 秒无操作时重新提醒

**技术要求**：
- 页面加载时并行调用：`/api/brands/[id]/actions`、`/api/dashboard/calendar`、`/api/dashboard/brand-activity`
- 将汇总数据作为 context 传给 AI，生成个性化开场白
- 自动触发 TTS（文字转语音）播报
- 头像同步进入"说话"表情状态

**验收标准**：
- [ ] 每次打开页面，AI 在 2 秒内开始说话
- [ ] 开场白准确反映当前实际数据状态
- [ ] 有待审批时，开场白必须提到
- [ ] 品牌超过 3 天未发布时，开场白必须提到

---

### 🅲 P1 — 功能 C：对话式草稿审核（Conversational Draft Approval）

**描述**：品牌主可以通过自然对话直接审批或拒绝 AI 生成的内容草稿，无需跳转到单独的审批页面。

**完整对话流程示例**：

```
AI（主动）: "老板，我给小红书写了一篇关于周末特惠的内容，您要听一下吗？"
用户: "说来听听。"
AI（读草稿）: "周末限定！波士顿大龙虾买一送一，仅限堂食。带上家人一起来，让每个周末都变得特别。📍[地址]"
用户: "发出去吧。"
AI（执行）: "好的！已安排在今天下午 6 点发布到小红书。"

---

用户: "重新写，改成更接地气的风格。"
AI（执行）: "收到！我来重新写一版..."
```

**支持的审核指令**：

| 用户意图 | 示例话术 | AI 执行的操作 |
|---------|---------|------------|
| 批准并发布 | "发出去"/"可以"/"就这样" | 调用 `/approve` API |
| 批准但调整时间 | "明天早上 10 点再发" | 更新 scheduledAt + approve |
| 拒绝重写 | "重新写"/"风格不对" | 调用重新生成 API |
| 拒绝并放弃 | "算了，先不发这篇" | 将草稿标记为 archived |

**多轮上下文记忆（架构要求）**：
- 前端维护 `conversationHistory[]`（用户/AI 交替消息记录）
- 每次请求将 history 传给后端 API
- 后端将 history 注入 prompt，AI 能理解"刚才那篇"指代哪个 draftId
- 当前活跃草稿的 draftId 通过 history 隐式传递

**验收标准**：
- [ ] 用户说"发出去"时，AI 能识别并调用正确的 draftId approve API
- [ ] 用户说"改成明天发"时，AI 能正确更新排期时间
- [ ] 用户说"重新写"时，AI 能重新生成内容（保留品牌上下文）
- [ ] 多轮对话中 AI 始终记住当前讨论的是哪篇草稿

---

## 五、现有功能保留（不变更）

| 功能 | 现状 | 状态 |
|------|------|------|
| GENERATE_AND_PUBLISH 语音触发 | 检测"发布"意图→批量生成并排期 | ✅ 保留 |
| 发布日历（嵌入式） | 月视图，查看排期和已发布 | ✅ 保留 |
| 素材库 | 上传和浏览图片/视频素材；上传前基础准入校验 | ✅ 保留并加强 |
| 店内活动（Game Settings） | 配置集章/积分活动 | ✅ 保留 |
| AI 角色设置 | 配置 AI 风格、菜单知识 | ✅ 保留 |
| 侧边栏抽屉导航 | 主页→各子功能入口 | ✅ 保留 |

素材上传采用前后端双重校验：AMC-MM 在申请直传地址之前先检查文件类型、大小及可读取的图片/视频参数，服务端在确认上传时重新读取 OBS 原文件并以服务端结果为准。图片仅接受 JPEG/PNG/GIF/WebP 且不超过 10 MB，视频仅接受 MP4/MOV/WebM 且不超过 250 MB；不合规文件返回结构化错误，不自动裁剪、压缩或转码。发布时由 AMC 后端再按目标平台检查 Instagram/TikTok 参数，平台建议的图片/视频格式、大小、尺寸、比例、编码、帧率和时长仅返回 warning 并继续提交；无素材、媒体混合、数量非法、文件损坏或源文件不可访问仍阻止发布。历史图片超过 10 MB 时允许发布前读取并提示，Instagram 单视频默认作为 Reel 发布。

---

## 六、未来版本规划

### v1（当前版本，待开发）

| 功能 | 优先级 |
|------|------|
| A — AI 查询（实时数据问答）| P0 |
| D — 主动开场白 | P0 |
| C — 对话式草稿审核 | P1 |
| **PWA 支持**（添加到手机桌面） | **P1** |

### v1.1（未来 3-6 个月）

| 功能 | 说明 |
|------|------|
| **本地 AI 意图识别** | 浏览器内小模型（Gemini Nano / WebLLM），意图识别响应 < 200ms |
| **语义记忆（长期）** | Transformers.js Embedding + IndexedDB 向量搜索 |
| **离线对话** | 无网络环境下基础对话可用 |
| B — 指定参数创作 | “帮我写小红书，明天 10 点发” 精细化控制 |
| E — 数据查询 | “上周哪篇效果最好？” 数据分析问答 |

### v1.2（未来 6-12 个月）

| 功能 | 说明 |
|------|------|
| F — 知识库更新 | 对话式更新菜单/品牌信息 |
| 消息推送通知 | iOS 推送、Android 推送 |
| 多品牌切换 | 一个账号管理多个品牌 |

### v2.0（原生 App， 1 年后）

| 功能 | 说明 |
|------|------|
| React Native iOS + Android | 复用 90% Web 业务逻辑代码 |
| 语音唤醒 | Hey Siri / 手机语音快捷键直接呼叫 AI |
| 锁屏 Widget | 今日内容状态一眼看到 |
| Core ML 加速 | iOS 本地模型比 WebGPU 快 3-5x |

---

## 七、技术架构变更要求

### 7.1 系统架构概览

AMC-MM 采用 **端云协同（Edge-Cloud Synergy）** 架构：
1. **边缘计算层（Edge）**：负责 UI 交互、本地缓存（localStorage）、TTS 实时播报、PWA 安装及 Service Worker 离线支持。
2. **业务 API 层（Cloud）**：负责跨设备状态同步、Tool-call 处理、数据库读写及权限验证。
3. **模型推理层（LLM）**：支持云端高性能 LLM，未来版本引入端侧小模型以降低延迟。

### 7.2 voice-chat API 扩展

**当前**：单轮对话，仅支持 `GENERATE_AND_PUBLISH` 一个 action

**目标**：多 action + Tool-call + 历史记忆

```typescript
// 新的 API 请求体
{
  message: string,
  history: Array<{ role: 'user' | 'assistant', content: string }>,
  context?: {
    pendingDraftIds?: string[],    // 当前待审批草稿
    activeDraftId?: string,        // 当前正在讨论的草稿
  }
}

// 新的 API 响应体
{
  reply: string,
  action: 'NONE'
       | 'GENERATE_AND_PUBLISH'
       | 'APPROVE_DRAFT'
       | 'REJECT_DRAFT'
       | 'RESCHEDULE_DRAFT'
       | 'QUERY_CALENDAR'
       | 'QUERY_ACTIONS',
  params?: {
    draftId?: string,
    scheduledAt?: string,
    note?: string,
  }
}
```

### 7.2 Proactive Context API（新增）

```
GET /api/brands/[id]/companion/context
Response: {
  pendingActions: number,
  todayScheduled: number,
  lastPublishedByPlatform: {
    [platform: string]: string | null
  }
}
```

### 7.3 前端对话状态管理（新增）

```typescript
const [conversationHistory, setConversationHistory] = useState<Message[]>([])
const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
const [pendingDraftIds, setPendingDraftIds] = useState<string[]>([])
```

---

### 7.4 PWA 配置（v1 新增）

**目标**：品牌主可将 AMC-MM 一键安装到手机桌面，体验接近原生 App。

#### 实现清单

```
1. 安装依赖：next-pwa（或 @ducanh2912/next-pwa）
2. 配置 next.config.js → 启用 Service Worker 生成
3. 新建 public/manifest.json
4. 在 app/layout.tsx 添加 <link rel="manifest">
5. 创建 144x144 / 192x192 / 512x512 App 图标（AMC-MM 品牌）
```

#### manifest.json 关键配置

```json
{
  "name": "AMC AI Marketing Companion",
  "short_name": "AMC-MM",
  "description": "您的 AI 营销员工，随时随地",
  "start_url": "/mock-merchant",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4F46E5",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

#### Service Worker 缓存策略

| 资源类型 | 缓存策略 | 说明 |
|---------|---------|------|
| HTML Shell | Cache First | App 框架离线可用 |
| API 数据请求 | Network First | 优先实时数据，失败时用缓存 |
| 静态资源（JS/CSS）| Stale While Revalidate | 先用缓存，后台更新 |
| Avatar/图片 | Cache First | 头像不变，永久缓存 |

#### 安装引导 UX

- 首次访问后 30 秒：底部弹出安装提示横幅
- AI 伴侣主动说："老板，您可以把我装到手机桌面，随时找我更方便！"
- 用户点击"安装"→ 触发 `beforeinstallprompt` 事件

#### 验收标准
- [ ] Chrome/Edge 桌面及 Android 用户可看到安装提示
- [ ] 安装后以 `standalone` 模式全屏运行（无地址栏）
- [ ] iOS Safari 用户可通过"分享→添加到主屏幕"安装
- [ ] 离线状态下可打开 App，显示缓存的主界面和最近对话

---

### 7.5 端云协同架构（v1.1 前瞻，供参考）

```
浏览器端（Edge）                         云端（Cloud）
─────────────────────────               ──────────────────────
🎤 Azure STT → 文字                       AMC 服务器 API
       ↓                                  ├── 内容创作（AI Agent）
🧠 Gemini Nano / WebLLM                   ├── 草稿审核（/approve）
   意图识别（< 200ms）                      ├── 日历查询（/calendar）
   ├── "查询" → 调云端 API                 └── DB 对话记录同步
   ├── "审核" → 调云端 API
   └── "闲聊" → 本地直接回复
       ↓
💾 Transformers.js Embedding（22MB）
   ├── 对话向量化
   └── IndexedDB 语义搜索
       ↓
🔊 Azure TTS → 语音播报
```

---


### 8.1 开场白展示
- AI 头像进入"说话"动画状态
- 开场白文字逐字打出效果（typewriter）
- TTS 自动播报（用户可点击静音）
- 说完后头像进入"待机"状态

### 8.2 草稿审批快捷操作卡
AI 朗读草稿时，底部弹出操作卡片：
```
┌──────────────────────────────┐
│  [✓ 批准发布]  [✗ 拒绝重写]      │
│  [🕐 调整时间]  [✏️ 修改内容]     │
└──────────────────────────────┘
```
用户可点击按钮或语音说话，两种方式均有效。

### 8.3 查询结果数据卡
AI 语音回答的同时，在对话气泡下方显示迷你数据可视化卡片。

---

## 九、验收标准总览

| 功能 | 关键指标 |
|------|---------|
| 主动开场 (D) | 页面加载后 ≤ 2 秒开始说话，数据准确率 100% |
| 内容查询 (A) | 正确理解意图率 ≥ 90%，响应时间 ≤ 3 秒 |
| 草稿审核 (C) | 对话式 approve 成功率 ≥ 95%，多轮上下文正确率 ≥ 85% |

---

## 十、开放问题（待决策）

1. ~~**语言**~~ ✅ **已决策：中英混合**（中文为主，专业术语用英文）
2. **TTS 引擎**：待定（暂继续使用 Azure Speech）
3. ~~**草稿朗读长度**~~ ✅ **已决策：需要截断**，建议朗读前 100 字，剩余部分显示在对话气泡中供用户自行阅读
4. ~~**错误处理 Fallback**~~ ✅ **已决策：请求重复**，即 AI 听不懂时回复：*"不好意思，您能再说一遍吗？"*

---

## 十一、对话历史持久化方案（已决策）

### 策略：混合持久化

```
写入链路（每次对话结束后）：
用户发消息 → AI 回复 → 同步写入 localStorage → 异步写入 DB

读取链路（页面加载时）：
1. 优先读 localStorage（毫秒级，无 loading）
2. 后台静默 fetch DB 版本
3. 若 DB 版本更新（跨设备写入），合并并更新 localStorage
```

### 数据库 Schema（新增表）

```prisma
model CompanionMessage {
  id        String   @id @default(cuid())
  brandId   String
  userId    String
  role      String   // 'user' | 'assistant'
  content   String
  action    String?  // 记录 AI 执行了什么操作
  draftId   String?  // 关联的草稿 ID（审核场景）
  createdAt DateTime @default(now())

  brand     Brand    @relation(fields: [brandId], references: [id])
  @@index([brandId, userId])
  @@index([createdAt])
}
```

### 新增 API 端点

```
// 拉取历史记录
GET /api/brands/[id]/companion/history?limit=50
Response: { messages: CompanionMessage[] }

// 追加新消息（异步，非阻塞）
POST /api/brands/[id]/companion/history
Body: { role: 'user' | 'assistant', content: string, action?: string, draftId?: string }
```

### 前端实现细节

| 场景 | 行为 |
|------|------|
| 首次打开 | 从 DB 拉取最近 50 条，写入 localStorage |
| 对话中 | 立即写 localStorage，后台异步 POST 到 DB |
| 换设备打开 | DB 拉取，与本地 localStorage 合并（DB 优先）|
| 清除历史 | 清空 localStorage + 调用 DELETE API |

### 保留策略
- localStorage：保留最近 **100 条**消息
- 数据库：保留最近 **30 天**或 **500 条**（whichever comes first），超出自动归档

---

*文档回写时间：2026-06-27（历史持久化决策更新）*  
*基于讨论结论整理，后续变更请更新此文档*
