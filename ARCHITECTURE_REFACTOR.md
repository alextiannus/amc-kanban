# 看板工具抽象层重构计划

## 目标
确保 AI Agent 不需要知道 PostFast、Google、Lark 等具体工具，只调用看板的统一业务 API。

---

## 当前状态（需要修改）

### ❌ 问题 1: Agent 指令暴露了工具名
```markdown
**PostFast（社媒发布 & 评论回复）**
- `postfast_publish` — 发布/排期社媒帖子
- `postfast_reply_review` — 回复 Google/Yelp 评论

**Google Business**
- `google_get_reviews` — 拉取 Google 商家最新评论
- `google_reply_review` — 回复 Google 评论
```

### ❌ 问题 2: MCP 工具名称包含实现工具
- `postfast_list_accounts` — 应该是 `list_accounts`
- `postfast_list_posts` — 应该是 `list_posts`
- `postfast_publish` — 应该是 `publish_post`
- `postfast_reply_review` — 应该是 `reply_review`
- `google_get_reviews` — 应该是 `get_reviews`
- `lark_notify` — 应该是 `notify_owner`
- `lark_upload_file` — 应该是 `upload_asset`

### ❌ 问题 3: Agent 需要选择工具
例如，Agent 要回复评论时，需要决定"用 PostFast 代理还是直接 Google API"。

---

## 目标状态（重构后）

### ✅ 统一的业务 API

**社媒账号管理**
- `list_accounts(brandId)` — 获取所有已连接账号（不关心来源是 PostFast、直接 API 还是其他）
- `connect_account(brandId, platform, redirectUrl)` — 授权连接账号

**内容发布**
- `publish_post(brandId, platform, caption, media?, scheduledAt?, accountId?)` — 发布/排期帖子
  - 看板自动选择 PostFast 或其他执行引擎
  - Agent 不需要知道使用了 PostFast

**评论管理**
- `get_reviews(brandId, platform?)` — 获取所有评论
- `reply_review(brandId, reviewId, replyText)` — 回复评论
  - 看板自动识别评论来源（Google、Yelp 等）
  - 看板自动选择 PostFast 代理或直接 API

**资产管理**
- `upload_asset(brandId, filename, mimeType, fileBase64)` — 上传文件到看板素材库
  - 看板自动决定存储位置（Lark 还是本地）
  - 返回可复用的资产 URL

**通知**
- `notify_owner(brandId, title, message, actionUrl?)` — 通知品牌主理人
  - 看板选择通知渠道（Lark、邮件等）

---

## 重构步骤

### Phase 1: 创建统一 API 层（后端）
- [ ] 在 `src/app/api/brands/[id]/` 下创建新的统一 API 端点
  - `/api/brands/[id]/posts/publish` （替代 postfast_publish）
  - `/api/brands/[id]/reviews/get`（替代 google_get_reviews）
  - `/api/brands/[id]/reviews/reply` （替代 postfast_reply_review）
  - `/api/brands/[id]/assets/upload`（替代 lark_upload_file）
  - `/api/brands/[id]/notify` （替代 lark_notify）

- [ ] 每个端点在内部包含路由逻辑：
  ```typescript
  // 例子：/api/brands/[id]/posts/publish
  if (brand.postfastApiKey) {
    return postfastPublish(...)  // 用 PostFast
  } else if (brand.directApiKeys) {
    return nativePublish(...)    // 用直接 API
  }
  ```

### Phase 2: 更新 MCP 工具（中间层）
- [ ] 在 `src/app/api/mcp/route.ts` 重新定义工具，使用统一名称
  - 旧：`postfast_publish` → 新：`publish_post`
  - 旧：`google_get_reviews` → 新：`get_reviews`
  - 旧：`lark_upload_file` → 新：`upload_asset`

- [ ] MCP 工具实现调用新的统一 API 端点

### Phase 3: 更新 Agent 指令
- [ ] 修改 `skills/agent-instructions.md`
  - 移除"PostFast（社媒发布）"、"Google Business"、"Lark"等工具分类
  - 改为"社媒管理"、"评论管理"、"资产管理"等业务分类
  - 用业务语言描述，不提具体工具

- [ ] 新的工具列表示例：
  ```markdown
  **社媒管理**
  - `list_accounts` — 获取所有已连接的社媒账号
  - `publish_post` — 发布或排期社媒帖子
  
  **评论管理**
  - `get_reviews` — 获取最新评论和反馈
  - `reply_review` — 回复评论
  
  **资产管理**
  - `upload_asset` — 上传素材文件
  
  **通知**
  - `notify_owner` — 通知品牌主理人
  ```

### Phase 4: 更新集成文档
- [ ] 修改 `skills/amc-integrations.md`
  - 改为"看板 API 统一文档"
  - 说明看板如何根据品牌配置选择执行引擎
  - 在附录提及支持的执行引擎（PostFast、Google API、Lark、等）

- [ ] 移除工具特定的参数说明（如 PostFast 的 `scheduledAt` UTC 格式警告）
  - 这些细节交给看板内部处理

### Phase 5: 向后兼容
- [ ] 保留旧的 PostFast 工具名作为别名
  - 例：`postfast_publish` → 内部调用 `publish_post`
  - 标记为 deprecated，3 个月后移除

---

## 架构图

```
┌─────────────────────────────────────┐
│         AI Agent                    │
│  (龙虾 / Claude / OpenClaw)         │
└──────────────┬──────────────────────┘
               │
               │ 只知道业务操作
               │ (publish_post, get_reviews, etc.)
               ▼
┌─────────────────────────────────────┐
│    看板统一 MCP API 层              │
│  (src/app/api/mcp/route.ts)         │
│                                     │
│  • publish_post                     │
│  • get_reviews                      │
│  • reply_review                     │
│  • upload_asset                     │
│  • notify_owner                     │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│PostFast│ │Google  │ │Lark    │
│ API    │ │ API    │ │ API    │
└────────┘ └────────┘ └────────┘

看板根据品牌配置自动选择
```

---

## 实施顺序

**第一阶段（立即）**：
1. 创建统一 API 端点（保持现有 PostFast 逻辑，只是改路由）
2. 在 MCP 层添加新的工具别名

**第二阶段（1 周内）**：
1. 更新 Agent 指令（移除工具名称）
2. 更新集成文档

**第三阶段（1 个月内）**：
1. 移除 PostFast 工具别名
2. Agent 完全迁移到新 API

---

## 关键原则

- ✅ Agent 视角：只看"业务操作"
- ✅ 看板视角：隐藏"工具选择"的复杂性
- ✅ 扩展性：添加新工具时，只改看板内部，Agent 逻辑不变
- ✅ 可维护性：团队新成员清楚知道"Agent 层"和"实现层"的边界
