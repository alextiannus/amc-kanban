# amc-kanban & LangGraph.js 系统集成技术设计文档

本文件定义了 **AI 营销看板 (amc-kanban)** 系统与 **LangGraph.js 多智能体框架** 的系统集成规范、接口契约、流程设计以及多租户数据安全保障机制。

---

## 1. 系统架构概述 (System Architecture)

系统采用以 **Next.js (Node.js/TypeScript 运行时) + LangGraph.js (智能体编排)** 为核心的**单栈 Serverless/容器混合架构**。移除了独立的 Python AaaS 微服务，使得业务逻辑与智能体计算完全合二为一，极大地减少了网络延迟并降低了维护成本。

```
┌────────────────────────────────────────────────────────┐
│                      用户浏览器 (Next.js)               │
│             (看板 UI、SSE 实时推理流、素材上传区)          │
└───────────────────────────▲────────────────────────────┘
                            │ REST / SSE / WebSockets
┌───────────────────────────▼────────────────────────────┐
│                    Next.js 看板主服务器                  │
│       (处理 Auth, 数据库, 微信/Lark/OBS 接口, MCP Server) │
│       (内置运行 LangGraph.js Engine & Node-Agent 线程)   │
└───────────────────────────▲────────────────────────────┘
                            │ REST / gRPC 安全隧道
┌───────────────────────────▼────────────────────────────┐
│             云端多媒体执行沙箱 (Docker-Sandbox)         │
│     (仅在需要裁剪图片、转换视频、或者运行测试脚本时启动)    │
└────────────────────────────────────────────────────────┘
```

*   **Next.js (amc-kanban)**：
    *   **业务层与多租户网关**：托管 PostgreSQL 数据库，通过 Prisma 驱动进行业务查询，利用 RLS（行级安全）确保租户隔离。
    *   **LangGraph.js 引擎**：作为内置依赖库直接运行在 Node.js API Routes 中。智能体状态（State）的转移与计算直接在内存中完成，无需跨服务 IPC 通信。
    *   **实时事件网关**：内置 Server-Sent Events (SSE) 接口，直接捕捉 LangGraph.js 运行节点的事件并实时推送到前端。
*   **云端多媒体执行沙箱 (Docker-Sandbox)**：
    *   **独立计算沙箱**：当多媒体筛选员（AssetCuratorAgent）需要调用 FFmpeg 裁剪视频、或者执行复杂的代码分析时，Next.js 动态拉起一个隔离的 Docker 容器去跑这个任务，跑完立刻销毁，确保主系统绝对安全。

---

## 2. 状态图 (StateGraph) 节点流转与 HIL 拓扑

在 LangGraph.js 框架下，AI Crew 的协作流定义为一个 **有向无环图 (DAG / StateGraph)**。任务的运行状态通过共享的 `State` 字典显式流转。

### 2.1 LangGraph.js DAG 结构图
当协调官 Agent 激活一个运营循环时，节点执行如下流转拓扑（包含人机协同的 `interrupt` 断点拦截）：

```mermaid
graph TD
    Start([开始运行]) --> Coordinator[1. CoordinatorNode<br/>分配包与排期]
    Coordinator --> Copywriter[2. CopywriterNode<br/>撰写 Singlish 双语文案]
    Copywriter --> AssetCurator[3. AssetCuratorNode<br/>素材筛选匹配]
    AssetCurator --> Compliance[4. ComplianceNode<br/>ASAS/Halal 合规筛查]
    
    Compliance --> Decision{合规通过且非首月?}
    
    Decision -- 否: 触发 HIL 拦截 --> HILInterrupt[5. HumanInterrupt<br/>状态挂起 pending]
    Decision -- 是: 自动驾驶 --> Publisher[6. PublisherNode<br/>定时自动发布]
    
    HILInterrupt -- 人类审批确认 --> Publisher
    HILInterrupt -- 人类打回重写 --> Copywriter
    
    Publisher --> VerifiedLink[7. LinkScraperNode<br/>真实 URL 回采]
    VerifiedLink --> End([任务闭环 done])
```

---

## 3. 系统集成主要流程设计 (Integration Sequence)

### 3.1 Onboarding（新品牌上线）SOP 集成流程
通过 LangGraph.js 内置的 `thread_id` 对租户进行绝对隔离。当商家进行建牌初始化时，调用 StateGraph 进行流转：

```mermaid
sequenceDiagram
    autonumber
    participant Client as PWA / 商家浏览器
    participant API as Next.js API Routes (LangGraph)
    participant DB as PostgreSQL (Checkpointer)
    participant LLM as LLM 大模型 (如 Claude/Qwen)

    Client->>API: 1. 提交建牌申请 (携带 brandId)
    API->>DB: 2. 初始化持久化 Checkpoint (thread_id = brandId)
    
    Note over API: Onboarding Step 1 & 2 - 目标与调研
    API->>LLM: 3. 唤醒「调研 Agent」分析 Google Maps 数据
    LLM-->>API: 4. 返回抓取特征
    API->>DB: 5. 自动记录状态快照 (Prisma PostgresSaver)
    
    API->>API: 6. 发现公开信息未达 70%，触发流程拦截 (Interrupt)
    API-->>Client: 7. 挂起任务并返回 require_input 看板卡片
    
    Note over Client: 商家在手机 PWA 完成问卷并提交
    
    Client->>API: 8. 重新激活 Graph (携带同一 thread_id 及问卷数据)
    API->>DB: 9. 载入先前 Checkpoint 快照还原内存状态
    
    Note over API: Onboarding Step 3 & 4 - 策略制定与素材校验
    API->>LLM: 10. 唤醒「策略师」生成 3 套推广方案
    LLM-->>API: 11. 返回方案 Markdown
    API->>API: 12. 触发流程拦截 (等待主理人审批方案)
    API-->>Client: 13. 看板挂起方案确认卡片
```

---

### 3.2 日常工作飞轮（Background Polling Loop）SOP 集成流程
定时守护任务每 30 分钟轮询一次，驱动 LangGraph.js 检查待发内容或抓取评论。

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Serverless Cron
    participant API as Next.js API Routes (LangGraph)
    participant DB as PostgreSQL (Checkpointer)
    participant X as 社交媒体 API (GBP/Instagram)

    Cron->>API: 1. 定时触发 /api/cron/polling
    API->>DB: 2. 查询处于活跃期的品牌列表 (SQL RLS 过滤)
    
    loop 遍历每一个品牌 (并行计算隔离)
        API->>DB: 3. 提取 brandId 对应的最近一次 Checkpoint 快照
        API->>X: 4. 读取该品牌社媒未读评论 (使用绑定的静态住宅代理)
        alt 评分 >= 4 星
            API->>API: 5a. 运行 CSRNode 自动回复
            API->>X: 6a. 推送答谢回复文案
        else 评分 <= 3 星
            API->>API: 5b. 触发 HIL 拦截，起草道歉信并挂载看板
            API->>DB: 6b. 保存 Checkpoint 并挂起
        end
        
        API->>DB: 7. 检查是否有已审批通过达发布时间的卡片
        alt 存在待发卡片
            API->>X: 8. 自动发帖推送
            API->>X: 9. 检索最新 Post 获取真实 URL
            API->>DB: 10. 回填看板卡片，状态置为 done，归档状态
        end
    end
```

---

## 4. 多租户数据隔离安全设计 (Multi-Tenancy Safeguards)

### 4.1 基于 Thread ID 的状态与长记忆隔离
LangGraph.js 采用内置持久化机制，所有状态与执行上下文都绑定在唯一的 `thread_id` 上：
*   系统使用品牌的 `brandId` 作为 `thread_id`。
*   Prisma 会在数据层将 `thread_id` 自动映射到 `brand_checkpoints` 物理表中。由于每个 API 请求都带有 RLS 鉴权，`thread_id` 的读取逻辑在底层被严格锁死在租户的 `brandId` 中，避免数据越权串扰。

```typescript
// 动态多租户调用示例
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { pool } from "./db";

// 初始化 PostgresSaver 持久化器
const checkpointer = new PostgresSaver(pool);
const app = workflow.compile({ checkpointer });

export async function executeTenantLoop(brandId: string, inputData: any) {
  // 强制多租户验证拦截器
  const hasAccess = await verifyUserBrandAccess(brandId);
  if (!hasAccess) throw new Error("Unauthorized brand access.");

  const config = { 
    configurable: { 
      thread_id: brandId // 用 brandId 作为隔离 Thread
    } 
  };

  // 运行 LangGraph，自动还原上一次的历史记忆，运行完毕自动保存最新快照
  return await app.invoke(inputData, config);
}
```

### 4.2 数据库行级安全 (PostgreSQL RLS)
所有业务表（`tasks`, `assets`, `brand_profiles`）在数据库层面均配置 RLS：
```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_tasks_isolation ON tasks
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true));
```
Next.js API Routes 在每次请求建立数据库会话时，强制设置 `app.current_tenant_id`，防止 AI 或主理人水平越权访问其他品牌的私有数据。

---

## 5. 品牌独享 IP 与登录态持久化规范 (IP & Session Security)

由于社交媒体平台（如 Instagram、小红书）具有极高强度的防机器人风控，必须针对每个品牌隔离出网特征。

### 5.1 新加坡静态住宅代理绑定
*   每个品牌关联一个唯一的静态住宅代理节点（socks5 格式）：
    `brandId` $\rightarrow$ `socks5://user:pass@sg-residential-isp.com:9000`
*   该代理出口节点表现为新加坡本地宽带服务商（如 Singtel/StarHub）。

### 5.2 Puppeteer/Playwright 代理沙箱注入
当多媒体筛选员（AssetCuratorAgent）进行内容发布时，运行在临时 Docker 容器中的无头浏览器自动挂载该静态代理 IP 启动：
```typescript
import { chromium } from "playwright";

export async function launchSandboxedBrowser(brandProxyUrl: string) {
  return await chromium.launch({
    args: [
      `--proxy-server=${brandProxyUrl}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });
}
```

### 5.3 会话 (Session) Cookies 的加密冷持久化
为了维持永久免密登录（规避频繁触发 OTP 验证码）：
1.  **加密冷存储**：首次扫码登录成功后，无头浏览器完整导出其会话的 `Cookies` 和 `LocalStorage`。
2.  使用 **AES-256-GCM** 算法，利用数据库内置的租户独享盐值对 Cookies 进行高强度对称加密，序列化写入 `brand_auth_sessions` 表。
3.  **动态热重载**：下次定时任务运行发布前，LangGraph.js 节点动态读取该加密会话，解密并注入 Playwright 上下文。对于平台而言，这表现为同一宽带 IP 的“老设备刷新页面”，实现登录态永久保持。
4.  **防关联清理**：容器每次执行发帖完毕后，执行磁盘与内存的高级擦除（Cache Cleanup），确保不遗留任何跨品牌的指纹关联特征。

---

## 6. 流式日志接口与可观测性审计 (SSE & LangSmith)

### 6.1 Server-Sent Events (SSE) 实时日志流
Next.js 看板前端可以通过 SSE 连接获取当前运行的 Agent 思考日志。
后端接口 `/api/brands/[id]/agent-stream` 定义流式输出规范：

```typescript
// Next.js API Route SSE 实现片段
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const brandId = params.id;
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // 订阅 LangGraph 事件流
      const eventStream = await app.streamEvents({ /* input */ }, { 
        configurable: { thread_id: brandId }, 
        version: "v2" 
      });
      
      for await (const event of eventStream) {
        if (event.event === "on_chat_model_stream") {
          const chunk = event.data.chunk.content;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", data: chunk })}\n\n`));
        } else if (event.event === "on_node_start") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "node_start", node: event.name })}\n\n`));
        }
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
}
```

### 6.2 LangSmith 生产审计
*   系统原生接入 **LangSmith**，用以全面追踪和可观测每一个租户在执行 LangGraph 节点时的详细执行链（Trace）。
*   自动记录每一次 LLM 调用的 Prompt 版本、返回参数、以及精确统计每日 Token 的费用消耗，用以进行跨品牌的成本审计与绩效考评。

---

## 7. WhatsApp 聊天通道集成协议 (WhatsApp Integration)

### 7.1 交互式消息模板定义
当 LangGraph 遇到 `HumanInterrupt` 触发挂起时，调用 WhatsApp Business Cloud API 向商家发送结构化交互按钮消息。

*   **消息负载格式 (JSON)**:
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+6587654321",
  "type": "template",
  "template": {
    "name": "amc_hil_approval_v2",
    "language": { "code": "zh_CN" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "松发肉骨茶" },
          { "type": "text", "text": "1星差评危机" },
          { "type": "text", "text": "等餐太久，汤不够热。" }
        ]
      },
      {
        "type": "button",
        "index": "0",
        "sub_type": "quick_reply",
        "parameters": [ { "type": "payload", "payload": "APPROVE_REPLY_123" } ]
      },
      {
        "type": "button",
        "index": "1",
        "sub_type": "quick_reply",
        "parameters": [ { "type": "payload", "payload": "CALL_HUMAN_123" } ]
      }
    ]
  }
}
```

### 7.2 Webhook 接收与流程恢复
1.  商家点击 `[一键批准发送]`，Meta 回调 Next.js 接口 `/api/webhooks/whatsapp`。
2.  Next.js 接收到回调，解析 `payload` 中的 `APPROVE_REPLY_123`（含 Task ID）。
3.  通过 Prisma 将该 Task 状态更改为 `done`。
4.  Next.js 提取对应 `brandId` 的 Checkpoint，并携带恢复输入参数重新激活 Graph 运行：
    `await app.updateState(config, { approved: true, comment: "Approved by Whatsapp" })`
    `await app.invoke(null, config);`
5.  Graph 节点自动从 HIL 断点处苏醒，恢复日常发布飞轮。

---

## 8. 素材库多存储引擎预览与代理协议 (Media Asset Library Proxying & Bulk Upload)

为解决非 URL 形式存储键（如 Lark fileToken `boxcnxxxx` 或 PostFast S3 存储键 `pf_file_xxxx`）在浏览器中无法渲染的问题，系统设计并集成了轻量级、高安全的本地文件媒体代理网关。

### 8.1 代理端点契约 (Proxy Endpoints)

#### 8.1.1 Lark 云文档代理
*   **路由**: `GET /api/integrations/lark/file/[fileToken]`
*   **安全机制**:
    *   读取 `MediaAsset` 查询其绑定的 `brandId`。
    *   通过 `canSessionAccessBrandProject` 校验当前登录 Session 是否拥有访问该品牌项目的权限。
    *   使用品牌专用的 Lark App 凭证获取 `tenant_access_token`。
*   **请求与流转**:
    *   代理向 Lark 发起 `GET https://open.feishu.cn/open-apis/drive/v1/medias/[fileToken]/download`。
    *   拉取文件流后，以对应的 `Content-Type` 和浏览器强缓存头（`Cache-Control: public, max-age=31536000`）回传客户端，保障预览体验。

#### 8.1.2 PostFast 媒体 S3 代理
*   **路由**: `GET /api/integrations/postfast/file/[brandId]/[...key]`
*   **安全机制**:
    *   校验当前登录 Session 拥有 `brandId` 项目的访问权限。
*   **请求与流转**:
    *   由于 PostFast S3 上的多媒体资产需要开放给社交渠道（如 Facebook、Instagram 等）拉取，因此该存储桶为公开只读。
    *   验证授权后，代理端点执行 **307 临时重定向** 至 PostFast 专属生产 S3 地址：`https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/[key]`，避免占用应用服务器带宽并极大加速加载。

### 8.2 动态 URL 重写映射 (Dynamic URL Rewriting)
为在保持 API 与底层数据库存储键兼容的同时，实现前端预览，在 `GET /api/dashboard/assets` 与 `GET /api/brands/[id]/assets` 两个获取资产列表的后端路由中：
*   当资产 `url` 为非 `http` / `/` 开头的原始存储键时，后端在返回 Payload 时对其进行动态重写：
    *   如果 `sourceType === 'lark'`，重写为 `/api/integrations/lark/file/${url}`。
    *   如果 `sourceType === 'postfast'`，重写为 `/api/integrations/postfast/file/${brandId}/${url}`。
*   在前端，移除了对非标准协议过滤的 `.filter(isPreviewable)`，当遇到不可解析的数据类型时退化为通用文件图标展位，避免资产“神秘消失”。

### 8.3 批量上传健壮性设计 (Bulk Upload Protocol)
*   **前端上传队列**: 前端 `uploadFiles` 将选中的 `FileList` 转为数组，执行顺序循环上传。
*   **单点故障隔离 (Error Isolation)**: 每一个文件的预签名获取、文件直传/备用 Base64 上传以及入库确认逻辑均用 `try/catch` 结构进行隔离。某个文件失败后，会把错误信息推入 `failedFiles` 错误收集栈，并不影响其他文件的继续上传。
*   **进度感知**: 在上传循环体中，使用 `uploadProgress` 变量动态更新当前正在上传的索引 (如 `正在上传 (2/5)...`)，从而提升用户在传输大文件或多文件时的交互体验。

---

## 9. 域名隔离与端点分离设计 (Domain Routing & Portal Separation Architecture)

为了向不同类型的用户提供最佳且低摩擦的界面交互，系统通过 Next.js 中间件对品牌主控制端与主理人/智能体运营看板进行了域名隔离与入口分流。

### 9.1 域名与角色匹配规则 (Subdomain Mappings)

*   **品牌主专属控制台 (Brand Owner Portal)**: 运行于 `amc-mm.immedi.ai`（本地开发使用 `amc-mm.localhost:3000` 或 `amc-mm.lvh.me:3000` 等 `amc-mm.` 前缀域名）。
*   **运营看板控制台 (Operator Kanban Board)**: 运行于 `amc-kanban.immedi.ai`（本地开发使用 `localhost:3000` 或 `lvh.me:3000` 等主域名）。

### 9.2 边缘侧 session 校验与重定向逻辑 (Middleware Routing Engine)

为了保持高效的路由分发且不引入额外的数据库查询负担，Next.js 中间件 (`src/middleware.ts`) 在 Edge Runtime 级执行以下轻量级校验流程：

1.  **静态资源与公共接口放行**: 中间件自动放行所有静态文件 (`_next/static`、`_next/image`、`favicon.ico`)、公共展示页面 (`/game` 等) 以及 API 请求 (`/api/`)，以保障两者共享同一后端核心 API 服务。
2.  **JWT Session 解密与过期验证**: 提取 `session` cookie 并使用 Edge 兼容的 `jose` 库进行解析与时效验证。若验证失败或已过期，则视为未登录状态。
3.  **分流路由策略 (Routing Policies)**:
    *   **在 `amc-mm.` 品牌主域名下**:
        *   若访问根路径 `/`，已登录重定向到 `/dashboard/brand-owner`，未登录重定向到 `/dashboard/brand-owner/login`。
        *   限制只能访问品牌主相关路由。如果用户尝试强行访问运营端页面（如 `/board`、`/connect`、`/learn` 等），将被重定向回品牌主控制台或品牌主登录页。
        *   在侧边栏抽屉菜单底部内置了统一的 `Log Out` (退出登录) 按钮，安全清除 session 并跳转回品牌主登录页面。
    *   **在 `amc-kanban.` 运营主域名下**:
        *   若访问根路径 `/`，已登录重定向到运营看板 `/board`，未登录停留在根路径 `/`（即主理人/代理商登录页）。
        *   限制无法访问品牌主路径。如果访问 `/dashboard/brand-owner` 或其子路径，中间件将根据当前环境动态将其重定向到对应的品牌主域名（例如 `http(s)://amc-mm.immedi.ai/dashboard/brand-owner`）。

