# AI Marketing Crew (AMC) 测试计划与用例集 (Test Plan)

本文件定义了 **AI 营销看板 (amc-kanban)** 系统的整体测试策略、自动化测试套件架构以及核心功能模块的测试用例设计，确保系统在交付生产环境时具备高可用性、高稳定度以及严格的多租户隔离安全性。

---

## 1. 测试策略与架构 (Testing Strategy & Architecture)

系统遵循**分层测试**的原则，通过单元测试、API 接口测试、流程集成测试、E2E 端到端校验以及生产环境验证，覆盖整个“AI 代工看板”的核心生命周期。

```
                    ┌─────────────────────────┐
                    │  5. 生产环境健康检查校验  │ <-- verify-oss-production.mts
                    └────────────▲────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    4. E2E 端到端黑盒测试   │ <-- Playwright / Playwright UI
                    └────────────▲────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    3. 业务流程与集成测试  │ <-- test-phase1-e2e / test-assignment-flow
                    └────────────▲────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  2. API 路由与边界权限校验 │ <-- test-api.mts / verify-permissions.mjs
                    └────────────▲────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   1. 静态代码与类型检查   │ <-- tsc --noEmit / eslint
                    └─────────────────────────┘
```

---

## 2. 自动化测试套件说明 (Automated Test Suites)

项目内置了丰富的自动化测试脚本，位于 `scripts/` 目录下，用于校验各核心模块的行为：

| 运行命令 (NPM Script) | 测试目标与模块 | 验证机制与核心逻辑 |
| :--- | :--- | :--- |
| `npm run lint` | 全局代码静态分析 | 运行 ESLint，排除潜在的语法隐患与非规范写法。 |
| `npx tsc --noEmit` | TypeScript 类型校验 | 编译期强类型审计，防止运行时隐式类型越权与空指针引用。 |
| `npm run build` | Next.js 生产环境构建 | 校验 Next.js 页面与服务端路由在生产模式下的编译稳定性。 |
| `npm run test:assignment-pool` | 智能体委派池 (Assignment Pool) 推荐 | 验证根据商家的品类/特征，委派池自动匹配最佳 AI Agent（匹配行业、溢出处理与降级路由）。 |
| `npm run test:assignment-flow` | 指派流 (Assignment Flow) | 验证任务指派链路，从 Task 创建到智能体状态流转的流式生命周期。 |
| `npm run test:execution` | 项目执行度分析 | 校验针对品牌运营效果的分析任务、数据提取统计以及看板可视化计算。 |
| `npm run test:phase1-e2e` | 阶段一综合端到端测试 | 自动模拟管理员映射、品牌创建/删除隔离、智能体排期以及幂等冲突处理。 |
| `npm run test:api` | REST 与 MCP 服务网关集成 | 校验 LangGraph/MCP 接口在处理自然语言意图时的响应完整性与参数限制。 |
| `npm run test:user-management` | 用户管理与智能体委托鉴权 | E2E 验证人类 API Key 委托验证、智能体级联拉入 Crew 以及双层 ACL 权限隔离。 |
| `npm run test:subscription` | 订阅计划与收费计费逻辑 | 校验新订阅版价格及服务内容调整后的订单计算与租户服务包配额。 |
| `npm run verify:permissions` | API 边界权限与防越权校验 | 启动本地服务，模拟不同角色 Session，进行跨品牌的防水平越权审计。 |
| `npm run verify:oss` | 生产 OSS 存储可用性与 CORS | 模拟上传临时小文件至华为 OBS 存储桶，验证签名算法、公网可读性与 CORS 首部字段。 |

---

## 3. 核心功能测试用例设计 (Core Test Cases)

### 3.1 资产库优化与微交互 (Assets Library & Micro-interactions)

#### TC-AST-001: 资产多图滑动与空态点击取消选择
*   **测试目的**：验证商家在资产库中能够丝滑地多选图片，并通过点击空白处一键清空选择。
*   **测试步骤**：
    1. 登录商家 Dashboard，进入 `素材库 (Assets)` 页面。
    2. 勾选“批量选择”开关，或点击多张图片的复选框，观察右上角“已选择 X 张”徽标更新。
    3. 将鼠标悬停在已选中图片的右上角，复选框应转换为红色的 `X` 按钮。
    4. 点击该红色 `X` 按钮，应成功单点取消该张图片的选中状态。
    5. 点击图片网格间的空白空闲区域，所有选中项应一键清空，计数器归零。
*   **预期结果**：复选框在悬停时出现优雅的红色 `X` 状态；点击网格间隙触发 `clearSelection` 且不冒泡；批量操作流畅。

#### TC-AST-002: AI 主题排期与待办任务自动生成 (HIL Mark for Schedule)
*   **测试目的**：验证点击“标记排期发布”时，能够通过弹窗录入主题描述并自动转化为看板 Todo 卡片。
*   **测试步骤**：
    1. 选中 1 张或多张素材图片，点击操作栏的 `标记排期发布` 按钮。
    2. 系统弹出高保真磨砂玻璃模态框，要求录入“主题描述 (Theme Description)”。
    3. 输入主题：“周五晚市黑胡椒蟹促销”，详细要求：“突出Singlish口语风格”。
    4. 在下拉列表中选择负责该品牌的 AI Agent，并点击“确认排期”。
    5. 进入 Kanban 看板页面。
*   **预期结果**：看板的 `TODO` 列中应自动创建一张新的 Task 卡片；卡片中自动关联了选中的图片素材 URL；指派人 (AssigneeId) 匹配选定的智能体，卡片带有明确的主题描述。

---

### 3.2 媒体代理与跨源访问 (Media Proxy & Storage Endpoints)

#### TC-PRX-001: Lark/PostFast 文件代理网关鉴权与重定向
*   **测试目的**：验证非 URL 形式的 Lark 云文档及 PostFast S3 键在前端预览时的安全转换。
*   **测试步骤**：
    1. 使用 Brand A 权限登录，在资产库中触发加载包含 Lark 键 (`boxcn...`) 或 PostFast 键 (`pf_file...`) 的资产。
    2. 查看网络面板中生成的图片请求 URL：
       - Lark 素材请求：`/api/integrations/lark/file/boxcn...`
       - PostFast 素材请求：`/api/integrations/postfast/file/[brandId]/pf_file...`
    3. **水平越权测试**：尝试使用 Brand B 的 Session 访问 Brand A 的上述代理接口。
*   **预期结果**：
    - 正确权限下，Lark 代理返回 200 及文件流，并带有 `Cache-Control` 强缓存头。
    - PostFast 代理验证权限后，返回 307 临时重定向，指向公开 S3 加速地址。
    - horizontal scale 越权测试时，接口 must 返回 403 Forbidden 或 404 Not Found。

---

### 3.3 订阅套餐内容更正 (Subscription Packages & Pricing)

#### TC-SUB-001: 运营费率更正与视频额度限制
*   **测试目的**：验证基础版、品牌版的新价格政策与短视频额度规则。
*   **测试步骤**：
    1. 进入 `服务计划 (Subscription)` 页面。
    2. 检查 `基础运营版` 的月度费率：应显示为 **600 USD**。
    3. 检查 `品牌建设版` 的月度费率与功能描述：
        - 费率应显示为 **2800 USD**
        - AI 制作选项应被移除
        - 视频生成/排期配额应精确标示为 **8条/月**
    4. 模拟发起一次品牌版的支付模拟，校验生成的 Stripe Webhook/API 请求体中价格 ID 与金额是否为 S$2800 (或等额美金)。
*   **预期结果**：界面展示文案、底层价格配置逻辑、Stripe Payload 全程一致，符合最新资助与收费标准。

### 3.4 用户管理与智能体委托鉴权 (User Management & Crew Auth)

#### TC-USR-001: 智能体级联拉入与双层鉴权 (Auto-Avatar Cascade Pull & Dual-Layer ACL)
*   **测试目的**：验证人类用户添加进 Crew 后，绑定的 AI 分身智能体也被自动添加；验证 AI 智能体拥有数据隔离边界权限，但功能上受只读/限制 WRITE 的限制。
*   **测试步骤**：
    1. 创建一个人类用户并为其绑定一个 AI 智能体作为其“AI 分身”（设置 `ownerId`）。
    2. 创建一个新品牌，并为其生成对应的 `MarketingCrew`。
    3. 调用 `addCrewMember` 将人类用户拉入该品牌的 Crew。
    4. 查询该 Crew 成员，检查刚才绑定的 AI 分身智能体是否已被联动、级联自动拉入到 Crew 中。
    5. 为人类用户生成一个 API Key Bearer Token。
    6. 使用该 Token 请求品牌接口，验证能正常通过数据边界鉴权。
    7. 模拟 AI 智能体使用该 Token 且携带 `x-agent-id` 头部发出 WRITE 请求。
*   **预期结果**：
    - AI 分身智能体已被自动且成功拉入战队（Cascade Pull 成功）。
    - 个人 API Key 正确解析并委托确权。
    - AI 智能体被授予 READ 权限，但其试图进行的品牌级 WRITE 操作被严格拒绝（403/Forbidden），证明双层 ACL 栅栏完全生效。

---

## 4. 生产部署集成验证 (Production Push Checklist)

在触发生产环境的发布动作时，必须严格执行以下三步走验证流程：

### Step 1: 本地全量健康自检
在本地执行：
```bash
./scripts/run-phase1-local-checks.sh
```
确保全量测试无一报错（输出 `PASS=6 FAIL=0`）。

### Step 2: 华为 OBS 存储接口通信测试
在云端主机或带有生产配置的终端运行：
```bash
npm run verify:oss
```
确保 OSS 响应 OK，CORS 白名单配置允许看板所有来源域的 OPTIONS 跨域预检。

### Step 3: Git 发布与流水线监控
1.  确认当前分支为 `main`。
2.  推送最新更改至生产分支：
    ```bash
    git push origin main
    ```
3.  登录 Render 控制台 (`dashboard.render.com`)，查看 `amc-kanban` 服务的 Build 日志，确信 `npx prisma db push` 架构自动同步完成，没有发生 runtime panic。

---

## 5. E2E Browser Testing for All User Flows (端到端浏览器自动化测试)

项目内置了基于 Playwright 的 E2E 自动化测试用例，用以校验以下三大用户角色的基本端到端交互链路。

### 5.1 测试范围与用户角色链路
1. **商家 / 主理人 (Merchant Owner)**:
   - 登录系统 -> 重定向进入商家看板 `/board`，核查基本图表与看板任务栏。
   - 进入个人主页 `/profile`，校验专属推荐邀请码以及个人海报等信息，尝试编辑并保存个人信息。
2. **业务开发人员 (BD / Principal)**:
   - 登录系统 -> 进入新品牌开户向导 `/board/subscription`（未绑定品牌时默认加载此界面）。
   - 录入品牌详细配置，进入套餐时长与套餐等级选择界面。
   - 输入并核销优惠码，验证优惠价格重新计算（如 10% 或 50% 折让），检验总支付费用的变动。
   - 确认激活并生成待支付订阅账单。
3. **系统管理员 (Admin / Operator)**:
   - 登录系统 -> 进入 `/admin` 管理控制台，校验 API 配置以及系统审计日志（AuditLog）的显示。

### 5.2 运行测试命令
测试脚本会自动在本地数据库进行种子初始化、拉起 Chromium 无头浏览器交互并在测试结束后清理数据库。
```bash
npm run test:e2e-basic
```
