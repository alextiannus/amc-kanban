# AMC Agent 接入与操作 SOP

版本：3.0
更新：2026-07-04

## 1. 身份模型

AMC Agent 是正常系统用户，不是人类用户的委托身份。

- 每个 Agent 使用绑定自身 User 的专属 API Key。
- REST 与 MCP 使用相同的角色、Capability 和 Crew 品牌权限。
- ADMIN Agent 与人类 ADMIN 权限完全一致。
- 所有写操作以真实 Agent actor 写入统一工作日志。
- 禁止新接入使用 Human Key + `x-agent-id`。旧调用只在上线后的 24 小时兼容窗口内可用。

品牌直接权限只来自有效 `CrewMember`；组织成员可继承 Organization Owner 的 Crew 品牌范围。`BrandOwner`、`BrandAgent`、`AgentPermission` 不再作为运行时授权依据。

## 2. 连接

推荐 MCP：

```json
{
  "mcpServers": {
    "amc-kanban": {
      "url": "https://amc-kanban.immedi.ai/api/mcp",
      "headers": {
        "Authorization": "Bearer <KANBAN_AGENT_API_KEY>"
      }
    }
  }
}
```

REST：

```http
Authorization: Bearer <KANBAN_AGENT_API_KEY>
Content-Type: application/json
```

不要发送 `x-agent-id`，不要在日志、Prompt、工作日志或业务资源中保存 Key。

## 3. 启动检查

1. 调用 `GET /api/agents/profile` 验证 Agent 身份。
2. 调用 `GET /api/agent/brand-config` 获取当前 Crew 授权品牌。
3. 对每个品牌分别记录 `brandId`，不得默认选择列表第一项。
4. 读取品牌 profile、subscription、social accounts、assets、drafts、reviews 和 ActionItems。
5. 403 表示身份有效但没有所需 Capability/Crew 权限；停止该操作，不尝试其他身份或旧接口绕过。

## 4. 标准业务循环

### 内容

1. 从 TopicFeed、品牌资料和素材库选择主题与素材。
2. 使用 `board_save_draft` 保存草稿并绑定 `accountId`。
3. 使用 `board_get_schedule_recommendation` 获取推荐时间。
4. 使用 `board_submit_draft` 提交。
5. `autoPilot=false` 时等待 ActionItem 审批；`autoPilot=true` 时按业务规则排期或发布。
6. 发布成功后保存真实平台 URL。

### 评论与预警

1. 使用 `get_brand_reviews` 获取新评论。
2. 有自动处理权限且符合品牌规则时使用 `board_reply_review`。
3. 低星评价、敏感内容或需人工决策时创建 `post_action_item`。

### 素材与配额

1. 对比 subscription 配额、已发布内容和未来排期。
2. 缺素材时创建 ActionItem，写清拍摄对象、格式、数量和截止时间。
3. 不创建泳道任务卡；直接继续操作 MediaAsset、ContentDraft、ActionItem 等业务资源。

## 5. 人机协作

需要人工补充信息、审核或决策时：

- 创建 ActionItem；
- 关联正确 `brandId`、草稿或账号；
- 描述必须包含背景、所需动作、截止条件；
- 人类完成后，Agent 继续原业务资源流程。

旧 `WorkUnit`、task API、泳道 MCP Tool 和 `create_require_input_task` 仅为迁移兼容，不用于新流程。泳道阶段只保留为工作日志中的 `workStage`。

## 6. API 与 MCP 安全规则

- `/api/brands/{id}/mcp/execute` 已关闭并返回 410；只使用 `/api/mcp`。
- 新 API Key 只以 Hash 存储，支持过期和撤销。
- 账号被禁用、Key 过期/撤销或 `authVersion` 变化后，调用必须失败。
- 第三方平台 Secret 由服务端管理，Agent 不读取或返回。
- 同一业务经网页、REST 或 MCP 调用时应得到相同的授权结果。

## 7. 调度

amc-kanban 不主动唤醒外部 Agent。可由 Agent 运行环境每 30 分钟触发一次轻量检查，并按品牌 timezone 执行每日深度循环。每轮只处理 Crew 授权品牌。

## 8. 常见问题

**可以继续用人类 Key 加 `x-agent-id` 吗？**

不可以用于新接入。旧调用仅有 T0 后 24 小时兼容期。

**Agent 获得 ADMIN 后是否仍受品牌 Crew 限制？**

ADMIN 是全局角色，与人类 ADMIN 相同；非 ADMIN Agent 必须同时具备 Capability 和品牌 Crew 范围。

**如何请求人类处理？**

创建 ActionItem，不创建 pending WorkUnit。

**为什么返回 401？**

凭证无效、过期、撤销，用户被禁用，或 Session `authVersion` 已失效。

**为什么返回 403？**

身份有效，但缺少显式角色 Capability 或目标品牌 Crew 权限。

**Agent 操作记在哪里？**

与人类操作一样进入统一工作日志，actor 为 Agent 自己。
