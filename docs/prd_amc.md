# AI Marketing Crew (餐饮零售自媒体运营看板) PRD 核心理念

> **PRD 维护原则（2026-07-04 起生效）**：本文件只描述当前有效的产品与架构理解。决策变化时必须直接改写所有受影响章节并清除冲突描述；历史版本由 Git 保存，不在 PRD 正文中保留已废止方案。用户、组织与权限的执行级规范以 [`prd_user_organization_permissions.md`](./prd_user_organization_permissions.md) 为准。

## 目标用户：中小出海中餐商家老板

针对中小出海中餐商家老板这个极具代表性的群体，其核心痛点在于：**极度缺人、极其忙碌、对海外多平台运营不熟悉（语言/文化壁垒）、且极其看重现金流和实际进店客流**。

对于这类老板，一个优秀的“餐饮零售自媒体运营看板（AI Agent Kanban）”不应该是复杂的数据分析仪表盘（传统 SaaS 化），而应该是一个**“极简的数字员工管理后台”**。

最重要的三个核心元素如下：

### 1. 结果导向的“到店转化”指标（摒弃虚荣数据）
出海餐饮老板通常不太关心虚无缥缈的“曝光量”、“点赞数”，他们最关心的是：“我花钱搞的这些自媒体，到底给我带来了几桌客人？卖出了几份外卖？”

*   **设计落点：** 看板的 C 位不应该放“昨日新增粉丝”，而应该放**“引流预估”**或**“直接转化效果”**。
*   **核心功能：** 
    *   **业务数据挂钩：** 将社交媒体的动作与实际生意挂钩（例如：通过带有专属折扣码的帖子追踪核销率，或者提供专属预订链接的点击转化）。
    *   **ROI 视图：** 一目了然的图表展现：“本周 AI 发布了 5 条帖子，小红书带来 20 次导航点击，Instagram 带来 15 次预订链接点击”。

### 2. 傻瓜式的“AI代工”与多平台一键分发（降低操作门槛）
海外运营涉及的平台又多又杂（Google Maps, Yelp, Instagram, TikTok, Facebook, 小红书等），老板根本没有时间和精力去一个个运营，也无力雇佣专业的本地化营销团队。

*   **设计落点：** 看板不应该是老板“自己干活”的工具，而是**“给 AI 员工派活”**和**“审核结果”**的待办列表（这也是 AI Marketing Crew 的核心理念）。
*   **核心功能：**
    *   **一键分发与多语言适配：** 老板只需上传几张新菜品的原图，AI Agent 自动生成适合 Instagram 的英文/本地语言文案，以及适合小红书的中文文案，老板在看板上点击“Approve（通过）”即可自动分发。
    *   **业务结果卡片化：** 运营动作直接呈现为内容草稿、发布排期、评价预警或 `ActionItem`。老板只需审核结果和处理必要事项；系统不再创建泳道任务卡或 `WorkUnit`。
    *   **自动化授权开关 (Trust Progression)：** 支持为 AI 设定“自动驾驶”级别。默认采用“需人工审核（Human-in-the-loop）”，老板在看板点击 Approve 才会发布；建立信任后，老板可通过全局或按平台设置的开关，一键开启“全自动发帖（Auto-Pilot）”，让 AI 完全自主接管日常更新。

### 3. 救火式的“舆情预警”与口碑防御体系
在海外做餐饮，Google Maps 和 Yelp 的评分简直是生命线。一条未及时处理的差评或卫生投诉，可能会直接导致未来一周客流腰斩。老板非常害怕错过这些致命信息，但又无法24小时盯着手机。

*   **设计落点：** 看板必须具备**“警报器”**属性，将最重要的信息强制推送到老板面前。
*   **核心功能：**
    *   **差评急救：** 一旦监控到 Google Maps 或社媒上出现 3 星及以下的评价，看板立刻标红置顶预警，并由 AI 直接提供 2-3 套极具同理心且符合公关标准的回复话术（英文/本地语），老板点击即可回复。
    *   **私信意向截流：** 很多客人会在 Instagram 私信问“今天开门吗？”、“能订位吗？”，AI Agent 自动秒回截流，并在看板上沉淀这些意向客户的数据，避免因为人工回复慢而流失顾客。

---

**核心产品定位：**
对出海中餐老板而言，最好的自媒体运营看板不是**“数据分析师”**，而是**“销售总监 + 公关经理”**。
以上三个元素（**转化追踪、AI代办、舆情防御**）分别解决了他们最关心的三大底层需求：**怎么赚钱、怎么省事、怎么保命**。

---

## 衍生核心功能：建立安全感与降低摩擦

基于上述三大需求，我们在 Kanban 的具体功能设计上，需要进一步加入能够降低老板认知负荷和管理摩擦的设计：

### 1. 降维版的“活动与内容发布日程表” (Activity & Content Agenda)
**问题：** 传统 SaaS 的内容日历过于专业，老板看不懂也没时间看，容易产生“AI 到底在干嘛”的黑盒焦虑。
**设计落点：将“运营计划”降维成“AI 员工本周的发布与活动排期”。**
*   **交互逻辑：** 不展示复杂的营销指标，而是直接告诉老板：*“本周二 AI 计划在 IG 发一条午市套餐；周五准备根据母亲节群发预订提醒”*。
*   **节日提案：** 遇到本地节假日，提前两周自动生成“节日营销提案卡片”（如：A方案送甜点，B方案打8折），老板做单选题即可。
*   **价值：** 给老板**掌控感和安全感**，不仅证明了 AI 在工作，还大幅降低了策划活动的门槛。
*   **Postiz-Style 界面重构设计（Stitch 统一源）：**
    *   **左侧托管渠道栏 (Channels Sidebar)**：展示所有绑定的账号（如 鼎泰丰/海底捞），包含各平台的连接健康度（例如异常时显示警告标志），内置 “🎤 AI 一键排期提案” 与 “新建发布” 入口。
    *   **顶部多视图过滤器 (Top Filters)**：提供周、月、日、列表（List）四种视图切换，并能一键过滤 “全部 / 待审核 / 已排期 / 已发布” 状态。
    *   **主日历网格 (Main Calendar Grid)**：以高识别度的平台彩色药丸卡片显示排期内容，支持在网格间进行可视化拖拽重排（Drag-and-Drop Rescheduling）。
    *   **右侧排期详情抽屉 (Schedule Detail Drawer)**：选中某天时，右侧划出抽屉式卡片列表，展示当天每条发帖的时间、文案和渠道细节，且针对“待审核”草稿提供 “🎤 AI 润色/创作” 的快捷入口。
    *   **未配置平台与已配置平台对等创作原则**：所有第三方平台均可作为工作和生成草稿的目标。已配置与否完全不影响对内容的创作与草稿的生成保存，只影响最终发布时是自动发布还是手动复制发布。在所有涉及多渠道内容创作、AI 创作及排期草稿保存的流程中，用户均可以选择并针对未配置平台进行内容创作。未配置平台的草稿将被完整记录在数据库中，并在日历和列表中清晰标识，提供复制按钮以及手动发布提醒，以便品牌主手动跨平台发布。

### 2. 极简的“灵感与素材黑洞” (AI-Driven Asset Library)
**问题：** 餐饮老板习惯用手机随手拍菜品、店面或客人，他们没有时间去为这些照片打标签、建文件夹、精修处理。传统素材库的层级管理对他们来说是灾难。
**设计落点：建立一个“只管往里扔，剩下的交由 AI 处理”的极简云相册。**
*   **交互逻辑：** 提供一个最简单的入口（支持手机端批量上传/扫码上传），老板随时随地把拍好的照片/视频“扔”进去。
*   **AI 自动化处理：** 
    *   **自动打标：** AI 视觉识别自动打上标签（如“宫保鸡丁”、“大堂环境”、“顾客合影”）。
    *   **Designer AI 智能对话修改：** 老板可以在素材洞察面板中直接与 Designer AI 对话，输入自然语言修改指令（如“裁剪为 1:1”、“添加水印”、“黑白滤镜”、“调亮”等）。Designer AI 会自动识别意图并对图片进行精细调整，并且**默认将修改后的图片保存为新素材，不会覆盖原始图片**，确保老板的原始素材安全。
    *   **自动寻宝与组装：** 当 AI 生成节日促销计划或日常发帖待办时，自动从这个“素材黑洞”里捞出匹配度最高的照片，甚至进行基础的亮度调整，直接配好多语言文案，呈现在 Kanban 的待办卡片中供老板一键 Approve。
    *   **准备草稿排期(idea)一键生成：** 老板可以在素材库中直接多选或单选素材，点击“准备草稿排期(idea)”，输入主题描述、目标发布账户、建议排期时间及具体要求，系统将基于素材与草稿模板一键生成对应的 Post 草稿，大幅缩短从素材到草稿发布的流程路径。
*   **价值：** 彻底打破“巧妇难为无米之炊”的困境，让素材管理做到**“零摩擦”**。老板只需要当一个没有压力的“随手拍摄影师”，AI 负责把这些碎片照片组装成营销弹药。

---

## AI 数字运营官 (AI Digital Operations Officer) 核心 User Cases

> **核心心智模型 (Mental Model)：** 这是一个活生生的“AI 员工”，而非一个冰冷的“软件工具”。所有的看板功能交互都应该围绕“老板与员工的协作”来展开。

### 基础设施与监控
1. **账号授权 (Onboarding)**
   * 老板可以在 Dashboard 上为 AI 员工配置并授权所有相关自媒体账号（如 Instagram, Google Maps, 小红书等）的访问和发布权限。
2. **账号资产监控 (Monitoring)**
   * 老板可以在 Dashboard 上直观查看每个被托管账号的核心健康度指标（如粉丝数量、粉丝增长变化趋势）。
3. **全局运营看板 (Global Operation Overview)**
   * 老板可以在 Dashboard 上拥有一个全局视角，一目了然地看到所有自媒体账号的健康状态和当下的运营动作。

### 协作与素材流转
4. **老板主动投喂素材 - 批量上传 (Material Ingestion - Upload)**
   * 老板随时可以将手机里拍好的菜品、客流等照片，通过 Dashboard 提供的极简上传入口直接提供给 AI 员工。
5. **老板主动投喂素材 - 对话框交互 (Material Ingestion - Chat)**
   * 老板可以通过对话框（Chat Interface），像发微信一样把临时拍的照片发送给 AI，并附上一句简单的嘱咐（如：“这是今天刚出的新品大龙虾，你想个文案发 IG”）。
6. **AI 员工主动“催收”素材 (Proactive Material Requesting)**
   * 当 AI 发现素材库枯竭，或者针对规划中的节日营销缺乏对应图片时，AI 员工会**主动向老板索取**所需素材（如：“老板，万圣节快到了，请发两张店面南瓜装饰的照片给我，以便我制作下周的宣传海报”）。

### 自动化与内容生产
7. **主动规划与创作 (Proactive Planning & Creation)**
   * AI 员工不仅是被动执行命令，它会根据节假日、本地热点和历史表现，**主动**进行未来的发布内容排期规划，并提前完成图文创作。
8. **自动化权限配置 (Automation Toggle / Trust Progression)**
   * 老板可以自由设置**“内容发布审核开关”**。
   * **需要审核（Review = Yes）：** AI 准备好社交媒体内容后，放入待办列表，必须等待老板确认（Approve）才能发布。
   * **全自动模式（Review = No）：** AI 员工获得完全授权，根据自己规划好的日程自主完成社交媒体的所有发布动作。

---

## 🎨 极致的 UI/UX 微交互体验 (Delightful Micro-interactions)

为确保“AI 员工”这一心智模型能够无缝落地并降低传统餐饮老板的数字摩擦，前端开发必须在细节上实现以下核心微交互：

1. **探探式“左滑右滑”批奏折 (Swipe for Approvals)**：首页的【待处理事项】卡片支持手势滑动，右滑 `[确认并发布]`，左滑 `[驳回重写]`，实现单手秒级批阅。
2. **聊天界面的“语音绝对优先” (Voice-First Input)**：悬浮 AI 助理的输入区域摒弃传统文本框为主的设计，采用占据底部 70% 宽度的巨大 `[🎤 按住说话]` 按钮，高度适配后厨等移动/嘈杂场景。
3. **上下文联想的“快捷回复胶囊” (Smart Quick Replies)**：AI 在对话框提交草稿后，动态生成快捷回复按钮（如“直接发”、“配图换一张”），将主观题转为单选题。
4. **AI 悬浮球的“生命呼吸感” (Breathing Status Indicator)**：全局悬浮球具备状态反馈。后台生成时显示**微弱呼吸灯**；遭遇危机差评时变为红色并**微震动**，建立“活着的数字员工”的视觉感知。
5. **游戏化升级：“主动索要职权” (Proactive Trust Suggestion)**：基于行为分析（如连续 5 次无修改 Approve），AI 主动在悬浮窗弹窗请求：“老板对我最近的表现满意吗？以后该平台需要我全自动发布吗？”将枯燥的系统设置转化为充满人情味的员工请示。
6. **拟人化 AI 助手动画与对话式看板 (Animated AI Employee & Conversational Chat)**：
   * 在 C 位或悬浮区域展示一个具备**细腻微动画**的 3D/Lottie AI 员工卡通形象。
   * 支持不同的动画状态反馈：**闲置呼吸 (Idle)**、**倾听波动 (Listening)**、**思考旋涡 (Thinking)**、**开心起舞 (Success)**，大幅度增强交互陪伴感。
   * 支持用户直接在对话框中以自然语言发号施令（如：“把我们下周的营业时间改成早上10点”、“帮我配张今天刚进的帝王蟹的文案”），AI 自动解析并调整系统参数或生成草稿。
7. **原生系统相册/相机无缝唤起 (Native Album & Camera Sync)**：
   * 对话框和素材库提供大按钮支持一键调取手机系统相册，或直接启动相机拍摄菜品。
   * 上传后，AI 自动在后台进行智能分类、亮度校准、并匹配相应的文案。

---

## 💳 订阅管理与增值服务市场 (Subscriptions & Add-On Store)

虽然具体大模型由 Admin 配置，但餐饮老板（品牌主）可以通过前端控制台自助管理其商业额度：
1. **基础订阅方案购买与切换 (Subscription Plans)**：
   * 老板可在账户页面一键购买、升级或调整套餐（如：从铜牌包升级为金牌包，解锁多账号发布额度与高优先级排队）。
2. **营销增值服务加购 (Add-On Services)**：
   * 支持单独加购高能耗 AI 工具包，例如：
     * **Veo3 视频生成增值包**（加购后，解锁将静态图转为 9:16 短视频的权限）。
     * **Dub.co 专属品牌域名短链追踪包**（加购后，支持绑定自定义短信/发帖短链接域名）。
     * **AI 电话预订接听员包**（加购后，开启电话端 AI 客服代接听）。

---

## 🤖 三级智能体架构 (Three-Tier AI Agent Architecture)

为支持多品牌运营并建立明确的权限与业务边界，我们将 AMC 的 AI 能力划分为三个层级，每类智能体拥有独立的技能集与知识库：

### 1. 平台级通用 AI (Platform AI)
*   **定位**：作为底层原子服务，通用服务于所有平台用户，包含 **AMC Copywriter** (文案生成/润色)、**AMC Designer** (视觉设计/水印排版) 与 **AMC Researcher** (商圈与热点检索)。
*   **优化与技能集**：
    *   **流式执行日志**：参考 Postiz，将文案生成拆分为“分析主题 $\rightarrow$ 提取钩子 $\rightarrow$ 多语种文案生成 $\rightarrow$ 视觉构图 $\rightarrow$ 最佳排期计算”的透明步骤，并在前端流式展现。
    *   **多语种本地化适配**：能够智能识别目标受众，并在文案中混合本地俗语（如新加坡的 Singlish 词汇 *chope* 等）以提高互动。
*   **知识库建设**：
    *   **全网餐饮爆款文案库**：积累不同平台（IG, 小红书, TikTok）的优秀案例和高转化排版结构。
    *   **通用敏感词与合规词库**：针对各个国家的广告法和平台规则进行内容安全过滤。

### 2. 管理层 AI (AMC MM & AMC Agent - 功能一致，权限隔离)
*   **定位**：提供完全一致的账号运营、排期重调度、差评急救、主动节日策略规划、素材催收及 ROI 审计功能，直接作为用户的智能虚拟营销经理与运营助理。
*   **账号权限边界隔离 (Scope Limits)**：
    *   **AMC MM (Marketing Manager)**：服务于**品牌主 (Brand Owner)**，其可见范围**仅限于用户自有的全部品牌**（单租户/单商家数据边界，绝对隔离他人品牌数据）。
    *   **AMC Agent**：服务于**平台主理人 (Coordinator/Operator)**，其可见范围**可以覆盖该主理人负责代运营的多个不同用户的品牌**（多租户/跨商户数据边界，便于主理人一站式管理多个品牌）。
*   **核心功能与技能集**：
    *   **通道存活与授权检测**：定期自动检测 Access Token 状态，过期时挂载高亮警告标志并提醒重新绑定。
    *   **主动策略提案与素材催收**：在本地假期前主动发出营销提案（如买赠/打折 A/B 方案）供用户选择，并主动催收出餐生图和短视频。
    *   **异常重调度 (Rescheduling)**：网络或授权中断发帖失败时自动退避重试，若失效则回退为 pending 状态并在日历中提示重新拖拽排期。
    *   **舆情防护与差评急救**：监控 Google Maps/Yelp 等渠道评分，发生差评时全局震动标红告警并秒级生成公关方案。
    *   **引流 ROI 数据审计**：自动统计专属优惠码/预约链接核销数据，输出引流效果分析报表。
*   **知识库建设**：
    *   **品牌私有知识库 (`brandcontext.md`)**：商家菜品清单、客单价、目标受众、特有促销规则等。
    *   **账号授权与表现数据库**：各平台 OAuth Token 生命周期、Optimal Post Time (最佳发帖时间模型)。
    *   **商圈竞争对手画像库**：周边竞品动态以调优自身营销方案。

---

## 💡 AI 交互与体验优化点 (AI UX & Interaction Optimizations)

依据 Postiz 的先进交互理念，AMC 增加以下 4 项 AI 核心优化：
1. **“玻璃盒”执行日志流 (Glass-Box Streaming Logs)**：将 LangGraph 运行状态转化为直观的前端流式通知，减少商家黑盒焦虑。
2. **“一键灵感提案”面板 (Free-Form Inspiration Dashboard)**：侧边栏整合灵感入口，支持商家直接输入一句话或复制外部竞品链接，自动触发多智能体协作生成排期草稿。
3. **智能修改快捷胶囊 (Smart Quick Replies)**：在内容审查弹窗下动态显示快捷指令按钮，将复杂的修改主观题转化为一键点击的单选题。
4. **素材一键变草稿 (Raw Photo to Draft Proposal)**：支持在素材库中多选照片，一键让 AI 生成排期提案并自动落入发布日历。
5. **多大模型后台热插拔配置与动态路由 (Multi-LLM Configuration & Routing)**：
    *   **管理员模型配置面板**：允许系统管理员在后台动态添加、启用/禁用多个大模型厂商服务（包括 OpenAI, Claude, Gemini, DeepSeek 以及自定义本地大模型 Shims），配置对应 API Key、代理 Endpoint、最高 Token 限制与适用任务标签。
    *   **智能体按需路由**：AMC 各个 AI 智能体节点可根据任务复杂度与吞吐要求按需调用不同的模型（如：`Researcher` 简单分类路由给低延迟的 `Gemini Flash`，`Copywriter` 生成爆款文案和 `Compliance` 深度合规审查路由给高推理能力的 `Claude 3.5 Sonnet` 或 `GPT-4o`）。
6. **端侧轻量自动化桥接（Client-Side Automation & Data Collection Bridge）**：
    *   **账号快照采集**：针对 Meta、小红书（Xiaohongshu）、Yelp 等官方接口风控严厉或难以获取的平台，利用品牌主的前端客户端（如 PWA、Chrome 插件或移动 App 的本地沙箱 Session）作为“端侧桥接智能体”。定期自动截取账号状态快照（如粉丝量、最新帖子阅读量、互动指标），安全同步至后台，确保数据更新的高频与准确。
    *   **端侧全自动/半自动发布**：当发布日程到达时，平台将审批通过的图文或短视频素材推送到客户端。客户端应用利用本地自动化脚本（如 WebView 内置脚本或插件自动化指令）直接在本地唤起平台并自动完成贴入发布，规避无官方 API 或商业授权账号成本极高的限制，极大地降低代运营成本。

---

## 📱 AMC MM (品牌主控制台) 核心交互工作流 (AMC MM Core Workflows)

为提升餐饮老板（品牌主）在使用 `amc-mm` 专属控制台时的发帖体验，规范了以下首页内容创作与发布闭环流程：

### 1. 素材上传与等待创意 (Raw Media Upload & Wait)
*   **交互规则**：品牌主在首页选择或拖拽图片/视频上传到素材库。上传完成后，系统**不自动执行任何生成或发帖动作**，而是进入等待创意状态。
*   **状态反馈**：页面以卡片网格形式展示已上传的临时素材缩略图，并提供文本框引导用户输入想法，或由 Voice Assistant（语音助手）引导用户说出创意。

### 2. 跨平台文案创作 (AI Write Copywriting Core)
*   **生成触发**：用户输入或说出创意构想后触发“开始创作”，系统后台调用与看板发布日历“AI Write”等同的 copywriter 智能体节点（加载品牌定制知识库、语气词典、历史反馈 Few-Shot 样本及图片标签进行“图不对文”合规校验）。
*   **输出内容与平台对等**：针对已配置及未配置的所有目标平台（如小红书、Instagram、Facebook）并行生成个性化内容与标签（Hashtags）。配置状态不应在生成阶段造成差异，不管是已配置还是未配置平台，AI Copywriter 都会生成完整内容，并通过页面内嵌卡片及预览抽屉对等呈现给用户。

### 3. 首页卡片左右滑动预览 (Inline Horizontal Carousel Preview)
*   **界面布局**：生成的结果不在弹窗或全屏遮罩中展示，而是直接在 `amc-mm` 首页渲染为内嵌的卡片横滑区域。
*   **横滑交互**：使用 CSS Snap Scroll (`snap-x snap-mandatory overflow-x-auto`)，支持老板左右手势滑动浏览不同平台的草稿卡片（包括已配置和未配置平台的全部生成结果，不发生任何卡片丢失），每张卡片支持文案和标签的二次编辑。

### 4. 智能排期与保存草稿 (Smart Schedule & Save Draft)
*   **业务逻辑**：用户点击“智能排期”后，选中的平台内容将被提交至后台 Post 管理数据库中，保存为 `draft`（草稿）状态。所有第三方平台无论是否配置，皆被支持保存草稿。
*   **后续流转**：草稿已设定 staggered（交错）的建议排期时间，处于未审批状态，静待人类品牌主理人（Coordinator）进行 Review 并完成排期终审或智能一键发布。

### 5. 直接发布与手动复制分流 (Direct Publish & Manual Copy Flow)
*   **分流逻辑**：用户点击“直接发布”或执行排期发布时：
    *   **已连接的平台**：系统自动在后台创建草稿并静默调用 `/approve` 接口（`publishType: 'immediate'`），一键直接发布。
    *   **未连接的平台（未配置平台）**：系统在数据库中保存草稿，保留在展示中不自动向社交网络发布。界面出现高亮提示，提供“复制手动发布文案”按钮，并在草稿详情附带手动发布提醒，支持用户一键复制正文+标签前往相应应用进行手动发布。这确保了用户即便在没有绑定账号的情况下，也能完整利用系统进行内容创作与发布管理。

### 6. 通知与待办事项 (Real-Time Notifications & Action Items)
*   **真实数据对接**：移除所有静态 Mock 的通知消息（如 Google Maps 低分评价、待审核发布日程）。系统实时从后端拉取当前品牌关联的未处理待办事项 (`ActionItem`，且 `status = 'pending'`)。
*   **红点指示器**：顶部 App Bar 的通知图标（Bell）持续显示，当且仅当存在未处理待办事项 (`actionItems.length > 0`) 时，在图标右上角显示动态红点提示。
*   **交互与状态更新**：
    *   折叠菜单中展示所有待办事项卡片，按优先级排序。
    *   用户点击待办卡片会触发对应行动：`sentiment_alert`（差评/警报）唤起 Companion Chat 的 AI 对话及分析响应；`content_draft` / `content_approval` 自动跳转至发布日历。
    *   每张卡片右侧提供“标记为已处理”的勾选按钮，点击后发送 `PATCH /api/brands/[id]/actions/[actionId]/approve` 请求在数据库中将其标记为已解决，并在本地列表中过滤移除。

### 7. 品牌列表加载机制 (Brand Loading & Visibility Scope)
*   **全量加载原则**：在 `amc-mm` 专属控制台首页，取消 `assignedOnly=true` 的强行过滤，以匹配品牌主/餐饮老板的视点。
*   **业务逻辑**：品牌直接访问范围只由有效 `CrewMember` 决定；组织成员通过其 Organization Owner 的有效 `CrewMember` 自动继承品牌范围。`Brand.ownerId`、`BrandOwner`、`BrandAgent` 和 `AgentPermission` 不再参与运行时授权。

---

## 系统配置架构决策 (System Config Architecture)

### 核心原则：所有 AI 模型 API Key 统一存储在 `LLMConfig` 数据表，不写入 Render 环境变量，不使用 SystemConfig 旧字段

**背景**：早期实现中，Gemini API Key 等凭证被放入 Render 服务的 Environment 变量中。随后迁移到 `SystemConfig.geminiApiKey` 数据库字段。**当前最终架构（2026-06 已全面生效）**：所有 AI 模型 Key 统一迁移至 `LLMConfig` 数据表，实现多供应商动态路由。

**为何不再使用 Render 环境变量或 SystemConfig 的旧字段**：
- 凭证更新需要重新部署（延迟高）
- 多服务实例之间无法共享配置
- 无审计追踪（无法知道谁在什么时间修改了哪个 Key）
- 无法支持多供应商按任务标签、优先级动态路由

### 当前 LLM 配置架构（LLMConfig 表）

| 配置项 | 存储位置 | 访问方式 | 禁止位置 |
|--------|----------|----------|----------|
| 所有 AI 模型 Key（OpenAI、Claude、Gemini、DeepSeek 等） | `LLMConfig` 表（DB） | `llmRouter.ts` 按任务标签路由 | ❌ Render env / SystemConfig 旧字段 |
| MiniMax TTS Key | `LLMConfig`（provider=`minimax`, taskTags=[`tts`]） | `llmRouter.ts` | ❌ SystemConfig.minimaxApiKey（废弃） |
| 其他第三方服务 Key（PostFast、地图等） | 对应数据库配置字段 | 对应读取函数 | ❌ 业务代码硬编码 |

**唯一例外**：`DATABASE_URL`、`JWT_SECRET`、`NEXTAUTH_SECRET`、`OBS_*` 等基础设施机密，仍放在 Render 环境变量中（这些无法从数据库读取，因为数据库连接本身依赖它们）。

### LLMConfig 数据模型

```prisma
model LLMConfig {
  id           String   @id @default(cuid())
  provider     String   // "openai" | "anthropic" | "google" | "deepseek" | "minimax" | "custom_shim"
  displayName  String   // 展示名称（如 "GPT-4o"、"DeepSeek-R1"）
  modelName    String   // 实际模型 ID（如 "gpt-4o-2024-05-13"）
  apiKey       String   // 加密存储的 API Key
  baseUrl      String?  // 自定义代理 Endpoint（可选）
  isEnabled    Boolean  @default(true)
  isDefault    Boolean  @default(false)
  priority     Int      @default(0)  // 数值越大优先级越高（高优先先尝试）
  taskTags     String[] // 任务适用标签，如 ["copywriting", "reasoning", "tts"]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### 管理入口
- **后台路径**：`/admin` → **AI 模型配置（LLMConfig）** 面板
- **说明**：在此页面添加/启用/禁用各大模型供应商，配置 API Key、代理地址、优先级、任务标签
- **路由逻辑**（`src/lib/llmRouter.ts`）：按 `taskTags`、`isEnabled`、`priority` 字段从 LLMConfig 表中动态选取最优模型，支持 Fallback 链

### 废弃字段说明
- `SystemConfig.geminiApiKey` — 字段保留但代码不再读取，**配置 Google 模型请在 LLMConfig 中添加 provider='google' 的条目**
- `SystemConfig.minimaxApiKey` — 同上废弃，**TTS 请在 LLMConfig 添加 provider='minimax', taskTags=['tts']**
- `getGeminiApiKey()` / `getMiniMaxApiKey()` — 函数保留（兼容旧数据迁移），新代码不得调用
- `GEMINI_API_KEY` 环境变量 — 从未作为主要配置来源，不使用

### MiniMax TTS 配置说明
- **服务**：MiniMax T2A v2
- **模型**：`speech-2.8-turbo`
- **默认音色**：`Chinese (Mandarin)_Warm_Bestie`
- **代理接口**：`/api/mm/tts-proxy`
- **降级策略**：MiniMax 不可用时，amc-mm 降级为浏览器 Web Speech API
- **废弃项**：Azure Speech SDK、Speech Token API、Azure Key/Region 字段均不再使用

---

## 📋 Changelog

### v1.1.0 — 2026-06-28

#### 功能变更：彻底移除 AI 泳道池，阶段分类仅保留在工作日志

**决策背景**：泳道看板与内容草稿、Action Item、工作日志重复，并迫使后台长期维护 `WorkUnit` 任务模型。AMC Agent 已统一为正常系统用户，应直接执行业务操作。

**变更内容**：
1. **彻底移除泳道前端**：删除泳道入口、组件、任务弹窗、任务卡、归档任务页及相关请求，不保留未来复用文件。

2. **移除任务后台模型**：业务流程改为直接操作 `ContentDraft`、`ActionItem`、素材、评价和发布资源；完成迁移后删除 `WorkUnit`、Task API 和 Kanban MCP Tool。

3. **工作日志记录所有员工操作**：人类和 AMC Agent 使用同一工作日志，`actorType` 仅用于辨识操作者类型。

4. **仅日志保留工作阶段**：使用 `workStage`（计划中、执行中、等待人工、已完成、失败）进行筛选，不再复用任务状态或泳道状态。

---

## Changelog

### v1.4 — 2026-06-29 主菜单导航精简（AI 序列 + 主理人看板移入 Profile 下拉菜单）

**需求**：将主导航栏中的「AI 序列」和「主理人看板」两个入口从顶部导航 Tab 区域移除，改为放置在右上角 Profile 下拉菜单中，以精简主菜单视觉噪声。

**变更内容**：
1. **修改** `src/components/layout/MainLayout.tsx`：从顶部 Tab 菜单中移除 `canSeeAgentsWorkflow`（AI 序列）和 `canSeePrincipalDashboard`（主理人看板）两个条件渲染按钮。
2. **修改** `src/components/layout/UserMenu.tsx`：在 Profile 下拉菜单中新增两个入口：
   - 「AI 序列」：仅对 `BRAND_OWNER` 显示，点击调用 `setCurrentView('agents')`。
   - 「主理人看板」：仅对 `ADMIN` 或 `AMC_PRINCIPAL` 显示，点击跳转 `/profile/principal`。
   - 两个入口均放置在现有「设置中心」条目之后。

**冲突检查**：无冲突。本次变更仅调整入口位置，不影响实际功能逻辑与权限控制。

---

### v1.3 — 2026-06-28 品牌主看板重设计（Brand Profile View）

**需求**：将 kanban 品牌主看板重设计为最佳展示品牌故事与品牌设定的方式，保留现有配置功能。

**实现**：
- **新建** `src/components/dashboard/BrandProfileView.tsx`：全屏覆盖式品牌档案页，4-tab 结构：
  - **品牌故事 Tab**：品牌 Logo（可上传）、名称/简介/地址编辑、AI 语气风格、俚语词典
  - **社交账号 Tab**：PostFast / Google Business / Lark 三平台卡片，点击调起 BrandSettingsPanel 配置弹窗
  - **品牌上下文 Tab**：知识库说明卡片 + 门店配置入口，调起 BrandKnowledgePanel
  - **订阅计划 Tab**：当前套餐展示、Add-on 状态、跳转订阅管理页链接
- **修改** `src/components/dashboard/MMDashboard.tsx`：
  - `activeSubPage` 类型新增 `'brand'`
  - 侧边菜单顶部新增「品牌档案」入口（琥珀色高亮，排在所有功能菜单最前）
  - 集成 `BrandProfileView`、`BrandSettingsPanel`、`BrandKnowledgePanel` 渲染逻辑

**保留功能**：社交媒体配置、品牌上下文查看/修改、品牌订阅计划查看（均通过各自 Panel/链接调起）

---

### v1.5 — 2026-06-29 · Feature: AI 训练数据采集与标注系统

**背景**：AI 对话日志（v1.6 amc-mm side）只是被动存档。本功能将其升级为 AI 矫正与训练数据平台，覆盖：
1. Companion 对话（语音/文字问答）
2. Copywriter 文案生成（system prompt + 用户输入 + 模型输出）

**核心目的**：Admin 标注 AI 的好/坏回复，并导出为 JSONL 供 fine-tuning 使用。

**架构决策**：
- 标注权限：Admin only
- 导出格式：JSONL（OpenAI fine-tuning 标准）+ CSV（人工审阅）
- Copywriter 日志范围：kanban Copywriter 模块 + amc-mm 伴侣触发的文案生成
- Prompt 版本：存原始内容，不强制版本号（可后加）

**DB Schema 变更**：
- `CompanionMessage`：+5 标注字段（rating, adminNote, correctedContent, isAnnotated, trainingTag）
- `CopywriterLog`：全新模型（15 字段，含 systemPrompt, userInput, rawOutput, 标注字段）

**新增 API**：
- `PATCH /api/admin/companion-messages/[id]/annotate`（标注对话消息）
- `POST /api/brands/[id]/copywriter-log`（文案日志上报，202 非阻塞）
- `GET /api/admin/copywriter-logs`（文案日志列表，Admin only）
- `PATCH /api/admin/copywriter-logs/[id]/annotate`（标注文案日志）
- `GET /api/admin/training-export`（导出 JSONL/CSV）

**Kanban UI**：
- ConversationLogPanel：消息气泡旁新增标注工具栏（评分/批注/纠正/训练标签）
- Admin 页新增「Copywriter 日志」子面板（system prompt 展开 + 标注）
- 导出按钮：筛选日期/品牌/类型/标签后生成 JSONL

**影响文件**：
- `prisma/schema.prisma`（CompanionMessage 扩展 + CopywriterLog 新建）
- 新增 API 路由（5 个）
- `src/components/ConversationLogPanel.tsx`（标注工具栏）
- `src/components/CopywriterLogPanel.tsx`（新建）
- `src/app/admin/page.tsx`（新 tab + 导出按钮）
- kanban Copywriter 路由（集成日志上报）

---

## Changelog v1.7 — 2026-06-29

### Scheduler 智能排期巡检系统

**背景与决策**：
- 触发方式：定时（Cron，每天 09:00）+ 手动触发（Admin/Coordinator）
- 发布标准：系统统一标准（暂不支持 per-brand 自定义频率）
- 重复检测：主题级别（关键词 Jaccard 相似度），30 天时间窗口，阈值 0.45
- 未绑定平台跳过频率检查（只检查已连接的 SocialAccount）
- 重复告警为**警告提醒**，不阻止发布

**AI Staff 角色体系对齐**：
- Copywriter（内容运营官）：amc-kanban 核心，已实现
- VideoCreator（视频运营官）：amc-kanban，节点存在，功能待扩展
- Scheduler（智能排期官）：amc-kanban，**本次实现**
- Designer（素材加工官）：amc-kanban，已实现

**Scheduler 发布频率标准（系统默认值）**：
| 平台 | 最低频率 | 沉默告警阈值 |
|------|---------|------------|
| Instagram | ≥ 2 篇/周 | 4 天无发布 |
| 小红书 | ≥ 2 篇/周 | 4 天无发布 |
| Google | ≥ 1 篇/周 | 4 天无发布 |
| Facebook | ≥ 1 篇/周 | 4 天无发布 |
| TikTok | ≥ 1 篇/周 | 4 天无发布 |

**告警类型（ActionItem.type）**：
- `scheduler_silence_alert`（high）：某平台超 4 天未发布
- `scheduler_frequency_low`（normal）：本周发布量低于标准
- `scheduler_topic_duplicate`（normal）：待发草稿与 30 天内内容主题相似度 > 45%
- `scheduler_publish_failed`（high）：草稿发布失败未处理

**新增文件**：
- `src/lib/topicExtractor.ts`：关键词萃取 + Jaccard 相似度（无外部 API）
- `src/agents/nodes/scheduler.ts`：Scheduler 巡检主节点
- `src/app/api/scheduler/daily-check/route.ts`：巡检触发 API（POST/GET）
- `src/app/api/scheduler/reports/route.ts`：历史报告查询 API
- `src/components/admin/SchedulerPanel.tsx`：Admin 巡检管理面板

**修改文件**：
- `prisma/schema.prisma`：ContentDraft + topicKeywords、SystemConfig + publishingStandards、新增 SchedulerReport 表
- `src/lib/systemConfig.ts`：新增 getPublishingStandards() + PublishingStandards 类型
- `src/agents/nodes/publisher.ts`：草稿创建时写入 topicKeywords + 重复警告
- `src/app/admin/page.tsx`：接入 SchedulerPanel

---

## Changelog v1.7.1 — 2026-06-29（设计决策确认更新）

### Scheduler 巡检行为修订（基于用户确认）

**Q1 决策（已实现）**：未绑定平台跳过频率检查，仅检查 `SocialAccount.connected = true` 的账号。

**Q2 — 发布频率标准修订**（由"每周篇数"部分改为"发布间隔"检查）：

| 平台 | 检查方式 | 标准 | 沉默阈值 |
|------|---------|------|---------|
| Instagram | maxDaysBetweenPosts | 间隔 ≤ 2 天 | 3 天无发布 |
| 小红书 | maxDaysBetweenPosts | 间隔 ≤ 2 天 | 3 天无发布 |
| Google | minPerWeek | ≥ 2 篇  - **默认密集贴纸网格墙（100% 屏效）**：系统默认将所有快照以高密度的网格形式展示。无页眉、无多余 UI 覆盖，使整个屏幕 100% 空间用于内容沉浸展示。
  - **拟物化贴纸飞入与弹性着陆效果 (Polaroid Sticker Fly-In)**：加载或换批时，每张社媒快照像贴纸一样从屏幕上方不同偏角坐标飞入，带有独特的旋转、缩放和微幅弹性反弹（Spring bounce）着陆特效，宛如实体相片粘在白板上。
  - **自动坠落与换批循环**：当前批次的快照在白板墙上静置展示 3 分钟（支持通过控制面板设定为 15 秒演示、30 秒、1 分钟、3 分钟、5 分钟等），停留期满后以重力加速度模式坠落并漂移出屏幕（Gravity fall-off）。在当前批次所有贴纸掉落完毕后，下一批贴纸紧接着飞入贴墙，实现全自动循环流转。
  - **错位悬浮呼吸微动**：快照贴墙静置期间，每个卡片仍带有微弱的悬浮和摆动呼吸感，各卡片的动画周期与延时完全随机（25秒~35秒），保持整面照片墙的灵动活力。
  - **底部触碰隐形控制台**：控制面板默认完全隐藏（`opacity-0`），只有当鼠标指针移入屏幕最下方的 120px 触碰区时才会以浮现（`opacity-100`），提供手动前后翻批、修改贴纸停置时长、网格列数密度（4/6/8列）、开关呼吸微动等设置。
  - **键盘快捷键操作**：支持 Space (强制掉落并换下一批)、ArrowLeft/Right (手动切换上一批/下一批)、F (全屏)、G (密集网格/单图模式切换)、H (键盘帮助) 键盘操作。��添加警告，不影响发布
- ✅ 新设计：**自动取消排期** — 将重复草稿 `status: 'scheduled' → 'draft'`，清除 `scheduledAt`
- 同时生成 **high priority** ActionItem 通知主理人修改主题后重新排期
- publisher.ts 不再生成重复警告，责任完全转移到 Scheduler 定时巡检

**影响文件（本次修订）**：
- `src/lib/systemConfig.ts`：PlatformStandard 新增 `maxDaysBetweenPosts?`、更新默认值
- `src/agents/nodes/scheduler.ts`：频率检查支持两种模式；重复检测改为主动取消排期
- `src/agents/nodes/publisher.ts`：`enrichDraftData` 简化为同步函数，移除重复检查逻辑
- `src/components/admin/SchedulerPanel.tsx`：更新巡检时间显示
- `src/app/api/scheduler/daily-check/route.ts`：更新 Cron 配置注释

---

## Changelog v1.8 — 2026-06-29（用户管理完善 + 邮件通知模块）

### 功能范围
本次迭代仅针对 **amc-kanban**，仅 **ADMIN** 用户可见/可操作。

### 用户管理增强

**编辑用户**（新功能）：
- 用户列表每行新增 ✏️ 编辑按钮，打开 `EditUserModal`
- 可编辑字段：昵称（nickname）、邮箱（email）、系统角色（ADMIN/USER）

**密码重置增强**：
- 重置后 Toast 通知：SMTP 已配置则"邮件已发送"，否则"请手动发送密码"
- API 返回 `emailSent: boolean`

### 邮件通知模块

**后端**：
- `SystemConfig` 新增 7 个 SMTP 字段（`smtpHost/Port/User/Password/From/FromName/Secure`）
- `src/lib/email.ts`：nodemailer 封装（sendEmail / sendPasswordResetEmail / sendWelcomeEmail）
- `GET/PATCH /api/admin/system-config`：支持 SMTP 读写（密码掩码）
- `POST /api/admin/email/test`：测试邮件 API（Admin-only）

**前端**：
- `EmailConfigPanel.tsx`：SMTP 配置表单（含密码切换显示、SSL/TLS 选择、测试邮件）
- 集成在 Admin → System 标签页（AI 配置面板之后）

**技术原则**：
- SMTP 凭证存于 DB，不写 Render 环境变量
- 密码在 AuditLog 中始终掩码
- 邮件失败不阻断主流程（non-blocking）

### 影响文件
- `prisma/schema.prisma`：SystemConfig 新增 SMTP 字段（已 db push）
- `src/lib/email.ts`：[NEW]
- `src/app/api/admin/system-config/route.ts`：扩展 SMTP 读写
- `src/app/api/admin/email/test/route.ts`：[NEW]
- `src/app/api/admin/users/[id]/route.ts`：密码重置集成发邮件
- `src/components/admin/EditUserModal.tsx`：[NEW]
- `src/components/admin/EmailConfigPanel.tsx`：[NEW]
- `src/app/admin/page.tsx`：接入两个新组件

---

## 角色与权限体系设计（讨论决策记录）— 2026-06-29

### 最终角色清单

本次讨论确认以下角色体系，兼顾当前和未来扩展需求：

| 角色标识 | 中文名 | 性质 | 开发状态 |
|---------|--------|------|---------|
| `ADMIN` | 系统管理员 | 平台最高权限 | ✅ 已有 |
| `AMC_PRINCIPAL` | 主理人 | 品牌代运营负责人 | ✅ 已有（待权限完善） |
| `BD` | 商务拓展 | 开拓客户、提交线索、查看收入 | 📅 未排期 |
| `BRAND_OWNER` | 品牌主 | 商家，拥有自己的品牌 | ✅ 已有 |
| `AGENT` | 代理商 | 更高级的管理权限 + 同时具备其他权限 | 📅 未排期（Phase 3+） |
| `AI_AGENT` | AMC Agent | 正常系统用户，通过专属 API Key/API/MCP 操作 | ✅ 已确认统一权限 |

### 确认的访问控制决策

**Q1 — 主理人在 amc-mm 的权限边界**  
✅ 结论：**主理人可以做品牌主能做的所有事情**（等价权限，不需要品牌主审批）

**Q2 — 品牌主能否登录 amc-kanban**  
✅ 结论：**可以**，但通过主菜单控制可见功能（不能访问 Admin 后台、数据分析等运营工具）

**Q3 — BD 访问内容**  
✅ 结论：
- BD **不能**查看具体品牌的内容草稿/Post/素材
- BD **只能看到**自己负责的品牌的**汇总信息**（签约状态/订阅状态/收入摘要）
- BD 按签约归属管理，每个 BD 只看自己客户的汇总，不看具体内容细节

**Q4 — 主理人兼 BD 的情况**  
✅ 结论：若一个人同时具有 `AMC_PRINCIPAL + BD` 两个 businessRole，则按**主理人权限**为准，可以正常使用代运营的所有功能。权限取并集，以高权限优先。

**Q5 — 代理商 (AGENT) 角色预留**  
✅ 结论：代理商具有"更高级管理人员的看板"权限，同时叠加其他角色（类似能管理旗下的 BD 和品牌主群体）。具体设计待 Phase 3。

**Q6 — 高级管理人员看板（缺失功能）**  
🆕 确认缺少：当前缺少一个面向 ADMIN/代理商的**跨品牌管理总览看板**（品牌数量、运营状态、收入汇总、BD 业绩等）。作为独立功能模块规划。

### 技术方案决策：显式角色 + Capability + Crew 数据范围

**核心要求**：

- `UserBusinessRole` 是全局角色唯一来源，禁止动态推导。
- `CrewMember` 是唯一直接品牌权限关系。
- 组织成员通过 Organization Owner 的 CrewMember 继承品牌范围。
- 人类和 AMC Agent 使用相同 Capability，不根据用户类型设置额外权限。
- 网页、REST API、MCP 复用同一认证、授权和业务服务。

```
授权结果 =
  显式全局角色拥有目标 Capability
  AND
  用户具有目标品牌的数据范围
```

第一阶段 Capability 在代码中集中、类型安全地定义，不建设可在 Admin UI 任意编辑的动态权限引擎。完整数据模型、迁移、API Key、性能与回滚要求见 [`prd_user_organization_permissions.md`](./prd_user_organization_permissions.md)。

### amc-kanban 菜单可见性矩阵（确认版）

| 菜单 | Admin | 主理人 | BD | 品牌主 |
|------|:-----:|:------:|:--:|:------:|
| 品牌运营首页 | ✅ 全部 | ✅ 分配品牌 | ❌ | ✅ 自己品牌 |
| 发布日历 | ✅ | ✅ | ❌ | ✅ |
| 发布内容（Post/Drafts） | ✅ | ✅ | ❌ | ✅（可审批） |
| 素材库 | ✅ | ✅ | ❌ | ✅ |
| 数据分析 | ✅ | ✅ | ❌ | ✅（仅自己） |
| 店内活动 | ✅ | ✅ | ❌ | ✅ |
| Principal 总览 | ✅ | ✅ | ❌ | ❌ |
| 管理看板（高级总览） | ✅ | ❌ | 📅 BD 汇总版 | ❌ |
| BD 工作台（线索/收入） | ❌ | ❌ | 📅 | ❌ |
| Admin 后台 | ✅ | ❌ | ❌ | ❌ |

### amc-mm 菜单可见性矩阵（确认版）

| 菜单 | Admin | 主理人 | BD | 品牌主 |
|------|:-----:|:------:|:--:|:------:|
| 首页 Dashboard + AI 伴侣 | ✅ | ✅ | ✅ | ✅ |
| 发布日历 | ✅ | ✅ | 📅 只读 | ✅ |
| 品牌故事（编辑品牌资料） | ✅ | ✅ | 📅 只读 | ✅ |
| 素材库 | ✅ | ✅ | ❌ | ✅ |
| 店内活动 | ✅ | ✅ | 📅 只读 | ✅ |
| 增值服务（订阅） | ✅ | ❌ | 📅 代客开通 | ✅ |
| 系统设置 | ✅ | ✅ | ❌ | ✅ |
| 添加新品牌 | ✅ | ❌ | 📅 | ✅ |
| AI 语音伴侣 | ✅ | ✅ | ❌ | ✅ |

> 📅 = BD 相关功能未进入开发排期

---

## 左侧导航栏重构 — 2026-06-29

### 变更决策

将 amc-kanban 的导航栏从顶部水平 Tab 栏重构为左侧垂直侧边栏，实现按角色的菜单分组与访问控制。

**已确认的权限细化决策**：
- **Q1 品牌主数据分析**：✅ 品牌主可见数据分析（`socialInsight`），自动过滤为自己的品牌数据。`dataAnalysis`（账号快照）仅 Admin/主理人可见。
- **Q2 主理人 AI 序列**：✅ 主理人也可见 AI 序列（`agents`），用于配置代运营品牌的 AI Agent。
- **Q3 侧边栏折叠**：✅ 支持折叠（宽 224px / 窄 64px 图标模式），状态持久化到 localStorage。

### 实现文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/lib/permissions.ts` | 新建 | 集中角色解析（`resolveRoles`）、视图访问检查（`canAccessView`）、菜单分组定义（`getMenuGroups`） |
| `src/components/layout/Sidebar.tsx` | 新建 | 侧边栏组件，按角色动态渲染菜单分组，支持折叠/展开，BD coming-soon 占位 |
| `src/components/layout/MainLayout.tsx` | 重构 | 布局从 `flex-col`（顶部导航）改为 `flex-row`（左侧导航），移动端改为抽屉式侧边栏 |
| `src/components/layout/UserMenu.tsx` | 简化 | 只保留用户信息 + 设置中心 + 退出，其余菜单项已迁移至 Sidebar |
| `src/components/KanbanBoard.tsx` | 更新 | 使用 `permissions.ts` 中的 `BoardView` 类型，新增 `managementOverview` 视图（占位） |

### 侧边栏菜单分组结构

| 分组 | 菜单项 | 可见角色 |
|------|--------|---------|
| 运营 | 品牌主看板、发布日历、发布内容、素材库、店内活动 | Admin、主理人、品牌主 |
| 数据 | 数据分析、账号快照*、工作日志 | Admin、主理人、品牌主（*快照仅前两者）|
| 管理 | 主理人总览（占位）、归档 | Admin、主理人 |
| AI 工具 | AI 序列 | Admin、主理人、品牌主 |
| 商务 | BD 工作台、客户汇总、收入总览（Coming Soon）| BD |
| 系统 | Admin 控制台（跳转 /admin）| Admin |

---

## Changelog v1.8.1 — 2026-06-29（页面布局与导航头优化）

### 页面布局与导航头优化
- **顶部栏动态页标题**：在桌面端和移动端顶部栏左侧增加当前视图标题（如“发布日历”、“数据分析”等）。
- **双重滚动条消除**：将 `<main>` 容器的 `overflow-y-auto` 改为 `overflow-hidden`，由具体子页面容器各自负责是否有滚动或高度铺满，消除了嵌套滚动问题。
- **清除历史布局残留**：废除了硬编码的 `h-[calc(100vh-140px)]` 及负边距，所有视图完美自适应新的垂直侧边栏页面布局。

- **侧边栏遮挡重叠修复**：移除 Desktop 侧边栏外部无宽度的包裹 `div`，直接由 `Sidebar` (传入 `hidden lg:flex`) 充当 flex item，修复展开/折叠时主内容被侧边栏盖住的布局引擎 bug。
- **太阳花 Logo 替换**：将侧边栏左上角临时手写的蓝色 `AMC` 圆圈，替换为系统正式 of 太阳花 Logo (`/logo.svg`)，在展开模式下水平排列 Icon 与 `AI Marketing Crew` 文本。
- **二级菜单自动折叠主菜单**：若页面内包含二级菜单（如日历页的托管渠道面板），用户进入页面 3 秒后主侧边栏将自动向左折叠收起，提供更多的主视口使用面积。
- **下线 AI 一键排期提案**：清除了发布日历中左侧托管渠道头部的“AI 一键排期提案”渐变彩色大按钮，回归纯排期功能。

### 影响文件
- `src/components/layout/MainLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `src/components/KanbanBoard.tsx`

---

## Changelog v1.8.2 — 2026-06-29（新建发布多平台预览交互重构）

### 新建发布多平台预览交互重构 (New Post Platform Preview Modal)
- **下线下沉式固定预览栏**：移除了新建发布时右侧占据 420px 宽度的固定预览 `<aside>` 面板，为主视口表单编辑器腾出完整编辑空间。
- **页面底部操作工具栏**：在发布草稿表单下方新增横向操作工具栏，包含 `取消返回`、`预览效果` 与发布/草稿等动作按钮。
- **全屏模态预览弹窗 (Modal Overlay)**：点击 `预览效果` 按钮后，弹出宽屏浮层模态框。预览卡片改用双列网格布局 (`grid grid-cols-1 md:grid-cols-2`)，优化了桌面端多平台并行展示效果。
- **排期控制拆分按钮移出**：将原本位于预览栏头部的“排期发布/保存草稿/智能排期”组合下拉按钮，平滑移动并融入表单底部工具栏中。
- **AI 创作自动呼起预览**：点击 “✨ AI 创作” 按钮启动 AI 生成后，会自动触发并显示预览模态窗，以便用户能在生成阶段实时观察每个渠道的 AI 创作进度与状态日志。

### 影响文件
- `src/components/dashboard/DashboardCalendar.tsx`

---

## Changelog v1.8.3 — 2026-06-29（发布日历高度容器自适应与滚动条修复）

### 发布日历高度容器自适应与滚动条修复 (Calendar Viewport Height & Scrollbar Fix)
- **移出 min-h-[750px] 硬编码高度限制**：将日历页面根部容器的 `min-h-[750px]` 修改为 `min-h-0`。这使日历页面在任何视口高度下，都能正确跟随外部布局容器（`h-screen`）进行自适应收缩。
- **激活内部 overflow-y-auto 滚动条**：解决了由于子级高度撑破父级而导致页面底部被浏览器截断、无法上下滚动的 bug。修复后，只要日历区域内容超过当前可视高度，主日历内部容器的 `overflow-y-auto` 会自动激活，确保所有日期与排期内容均可完整展现。

### 影响文件
- `src/components/dashboard/DashboardCalendar.tsx`

---

## Changelog v1.8.4 — 2026-06-29（统一发布预览看板看板及 AI 创作默认包含小红书）

### 统一发布预览看板与多渠道 AI 创作流程优化
- **提取 PostPreviewModal 独立通用组件**：将之前内嵌于 `DashboardCalendar` 中用于渲染五大平台 Mockup 预览的几百行复杂页面代码拆分并重构为一个独立的高内聚 `PostPreviewModal` 组件。支持针对各个平台设置独立的媒体滑块（图片轮播 / 视频播放）以及平台专属 caption / hashtags 的专属行内编辑弹窗。
- **日历与 Post 视图统一接入**：将 `DashboardCalendar` 的内嵌预览弹窗替换为 `<PostPreviewModal>`。在 `DraftManagementView` 中引入同样的新组件，将 AI 创作交互从原先的“直接关闭抽屉 + alert 提示”重构为“直接呼起多平台预览模态窗并在其中轮询 AI 状态，允许行内编辑和审核”。
- **三按钮集成与智能排期**：模态框底部固定渲染“取消创作”、“保存草稿”及“智能排期”三个主操作按钮。其中“取消创作”将物理清空 DB 中已生成的草稿，“保存草稿”为正常保存，“智能排期”自动请求品牌智能排期时段推荐 API 获得最合时宜的建议发布时刻，并直接提交至发布审查系统。
- **小红书默认强制创作**：在日历和草稿管理页面的“✨ AI 创作” / “✨ AI 重新创作”点击逻辑中，在触发 save/trigger 之前，自动检测并补齐所选发布渠道中的小红书（已授权账号则补足对应账号，未配置时自动补齐 unconfigured_red 虚拟占位符），实现 AI 撰写必定包含小红书内容的心智要求。

### 影响文件
- `src/components/dashboard/PostPreviewModal.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `src/components/dashboard/DraftManagementView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.5 — 2026-06-29（智能语料管理与 Prompt 优化生命周期）

### 1. 基于 平台控制的统一 Prompt 管理与 Trace 埋点 (Prompt Lifecycle)
- **统一人设指令控制**：将底层原子大模型服务（Platform AI）与应用管理层（AMC MM/Agent）的 System Prompt/工作流流程指令集中抽象并存储在数据库中，支持前台直接编辑保存。
- **动态 Prompt 注入与缓存**：AI 推理执行端（如文案创作、设计师分析）在执行前动态获取配置，并在本地实现内存/缓存控制，确保指令更改秒级生效。
- **全链路玻璃盒日志追踪 (Observability & Tracing)**：记录生成任务的 Input (输入偏好/原始素材) 与 Output (生成文案)，以 Trace 方式分步骤详细记录中间分析链条（分析主题 -> 提取 Hook -> 翻译 -> 审核），方便后续进行审计与评估。

### 2. 人机协同语料精炼与 Few-Shot 数据池构建 (Corpus Curation)
- **自动对齐标注 (Alignment & Feedback Loop)**：自动捕捉并记录商户对 AI 生成内容的真实编辑痕迹（`UserCorrectionFeedback` 表）。
- **微调偏好数据集（SFT & DPO）自动生成**：
  - **正样本 SFT 语料**：无修改或微调即发布的文案。
  - **DPO/RLHF 偏好对**：记录用户大幅度编辑（Diff > 20%）的文案，以 chosen (用户最终版) 与 rejected (AI 初始版) 配对。
- **微调语料标准导出**：在后台管理面板（`平台AI与语料学习`）提供导出功能，支持选择托管品牌并一键导出为标准的 ChatML-JSONL 语料包，可用于下发给微调机器。

### 影响文件
- `src/components/admin/PlatformAiTab.tsx`
- `src/components/admin/UsersTab.tsx`
- `src/app/admin/page.tsx`
- `src/lib/permissions.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.6 — 2026-06-30（数据驱动文案优化闭环：注入历史表现与品牌记忆）

### 数据驱动文案优化闭环与品牌记忆注入 (Analytics-Driven Copy Optimization & Brand Memory Integration)
- **数据流闭环打通**：将 `researcherNode` 收集并记录在 LangGraph 状态中的 `researchNotes` 成功注入至 `copywriterNode`。
- **背景信息注入 Prompt**：
  - **Stage 1 (Hook)**：AI Copywriter 生成点击率 Hook 时，显式地向大语言模型提供包含品牌联系方式、物理地址、历史高表现贴文数据与互动指标 (Impressions, Likes) 以及品牌文档与反馈历史记忆。
  - **Stage 2 (Body & CTA)**：AI Copywriter 生成正文和 Action 按钮指引时，参考上述 `researchNotes` 爆款模版风格与品牌负向规避词，使生成的营销文案具备更高的业务精确度与历史策略继承性。

### 影响文件
- `src/agents/nodes/copywriter.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.7 — 2026-06-30（推广邀请码与分成归因系统设计）

### 统一邀请码与分成归因系统 (Referral & Invitation Code System)
- **概念模型区分**：区分单次有效的激活 Token（`Invitation`表，用于团队与特定客户 onboarding）与多次分享的公开推荐邀请码（`User.inviteCode`，每个用户独享）。
- **注册链路与层级关联**：新商户使用带有推荐码的 URL (`/register?ref=CODE`) 注册时，后端 API 自动在 `User` 表建立 `referredById` 树状层级关系。
- **角色差异化收益归因**：
  - **BD 与主理人**：推荐码作为销售渠道标识，关联该推荐链条下的商户订阅与增值服务流水，在 `Revenue` 表进行佣金业绩归因。
  - **普通品牌商户**：推荐码作为自传播裂变，双方在注册或充值时触发系统推广福利（如优惠券或 AI 额度赠送）。

### 影响文件
- `prisma/schema.prisma`
- `src/app/api/auth/register/route.ts`
- `docs/prd_amc.md`
- `docs/design_invitation_system.md`

---

## Changelog v1.8.8 — 2026-06-30（通用裂变与独立营销优惠码系统设计）

### 裂变与营销优惠码系统设计 (Universal Fission & Marketing Promo Code Module)
- **通用裂变 (Universal Fission)**：支持所有用户角色（无论 Merchant、BD、Principal 还是 Admin）生成个人专属的 `inviteCode`，鼓励平台整体自裂变。
- **独立营销优惠码 (Campaign Promo Codes)**：新增 `CampaignPromoCode` 表支持生成诸如 `SUMMER2026` 独立营销兑换码，包含最大使用限额、折扣比率 (百分比/固定金额)、有效期约束及所有权归属。
- **特权管理面板**：为 Admin、Principal、BD 账户规划专属的 **“裂变与营销推广中心 (Fission & Promo Center)”**，实现营销推广码创建、启用/禁用和推荐业绩业绩分析的可视化。

### 影响文件
- `prisma/schema.prisma`
- `docs/prd_amc.md`
- `docs/design_referral_campaign_system.md`

---

## Changelog v1.8.9 — 2026-06-30（BD 阶段目标及线索查重与期限制设计）

### 销售阶段目标进度 & 线索周期规制
- **业绩目标汇率转换与分级提成**：本月总销售额增加 7.2 人民币汇率换算，分设 ¥36,000 (提成 5%) 与 ¥138,000 (提成 10%) 两层奖励，未达标提成锁 0%，提供“解题奖励”文本和激活率统计数据接口支持。
- **CRM线索查重拦截**：线索新建时对邮箱与手机号进行查重，已在 `SalesLead` 或 `User` 系统记录则返回 409 报错拦截。
- **CRM线索转化与超期失效**：已转化 (`ONBOARDED`) 和超期 (`>= 90天`) 线索在列表中剔除，对 `60-90天` 间的线索附加超期提醒。

### 影响文件
- `src/app/api/mm/bd/performance/route.ts`
- `src/app/api/mm/bd/leads/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.10 — 2026-06-30（AMC 学院页面太阳花主题 UIUX 重构）

### 学习中心 UIUX 与内容排版重设计
- **视觉主题重构**：将整个学院的黑暗风格调性（`bg-slate-950` 等）升级为太阳花专属明亮配色设计，包含浅乳酪奶油白背景（`bg-[#fefcf6]`）、淡黄色径向渐变光晕（`bg-yellow-300/15` / `bg-amber-400/10`）和网格线点缀。
- **卡片与排版重塑**：重构 4 大主 Tab、分类筛选 Chips 以及 Q&A 手风琴折叠面板。SOP 指南卡片改用温暖琥珀黄边框（`border-amber-300/50`）、浅白毛玻璃背景和玫瑰红警示框，全面提升行高、字重和可读性。
- **SOP 结构清理**：修正并排查了手册多阶段切换与排版中的内容重复冗余，清理了旧版 SOP-001/SOP-003 残留标签。
- **安全与合规协议样式**：安全合规警告板块采用温暖琥珀黄基调和深色字体样式，确立明亮感与突出视觉警示。

### 影响文件
- `src/app/learn/page.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.11 — 2026-06-30（侧边栏交互体验优化与提示文字修正）

### 侧边栏回缩防打扰与日历提示文字微调
- **侧边栏回缩防打扰**：在 `Sidebar.tsx` 中增加 `isHovered` 状态跟踪，当用户的鼠标悬停在左侧菜单栏区域时，自动挂起回缩动作，移开后恢复 3 秒倒计时自动回缩。
- **日程提示文字本地化微调**：将内容日历编辑面板与草稿详情弹窗中的 `内容创意 / 生成指令 (AI Idea & Prompt)` 提示文本调整为更贴合运营视角的 `素材说明/今日主题`。

### 影响文件
- `src/components/layout/Sidebar.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `src/components/dashboard/DraftManagementView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.12 — 2026-06-30（订阅周期与计费折扣调整）

### 订阅周期约束与价格政策更新
- **移除 1 个月短期订阅**：最低起签周期调整为 3 个月，在新建品牌向导及订阅计划前台页面中剔除了 1 个月（单月）的可选项，支持 3/6/12 个月周期。
- **取消所有订阅周期折扣**：下线了原先 3 个月(95折)、6 个月(9折)、12 个月(85折) 的自动周期折扣算法，所有周期统一使用无折扣基础月费（Starter: $600/mo, Essential: $2800/mo），移除了所有周期折扣率提示与优惠标签。

### 影响文件
- `src/lib/subscription/catalog.ts`
- `src/components/brands/NewBrandWizard.tsx`
- `src/app/board/subscription/SubscriptionClient.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.13 — 2026-06-30（AMC 学院默认 Tab 与文章上传接口扩展）

### 学院默认选项卡调整与 Markdown 直接上传支持
- **自媒体运营 Tab 设为默认**：将学习中心主页面（`/learn`）的默认激活选项卡从 `'qa'`（常见问题）改为 `'school'`（自媒体运营）。
- **增加 api/mcp 接口的 Markdown/JSON 直接上传支持**：扩展了 `/api/mcp` 路由，允许 AI 应用以 `text/markdown` 或非 standard JSON-RPC 格式直接通过 HTTP POST 方式提交 Markdown 内容，并将其自动解析并插入数据库为 `ARTICLE` 类型的学习中心文章。

### 影响文件
- `src/app/learn/page.tsx`
- `src/app/api/mcp/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.14 — 2026-06-30（直连社媒开发者应用证书配置与灰度路由）

### 直连 API 证书配置与发布路由适配
- **新增 SystemConfig 直连证书字段**：在数据库 `SystemConfig` 表中增加了 Meta (Facebook App ID/Secret, OAuth Redirect URI)、Google (Google Client ID/Secret, OAuth Redirect URI)、TikTok (TikTok Client Key/Secret, OAuth Redirect URI) 的开发者全局证书字段及灰度发布开关 `useDirectPublishing`。
- **系统设置界面直连表单**：在管理后台系统配置页面新增了“直连社媒应用授权秘钥”折叠面板，支持配置这三大平台的 Client ID / Client Secret 并能通过开关切换直连发布模式。
- **直连适配客户端与桥接器**：新增了 `googleBusiness.ts`、`facebook.ts`、`instagram.ts`、`tiktok.ts` 直连 fetch 适配客户端，并编写了 `client.ts` 用于在开启直连模式时直接走官方 API 渠道，未开启时自动 fallback 到 PostFast 的混合调度桥接逻辑。

### 影响文件
- `prisma/schema.prisma`
- `src/lib/systemConfig.ts`
- `src/app/api/admin/system-config/route.ts`
- `src/components/admin/SystemTab.tsx`
- `src/app/admin/page.tsx`
- `src/lib/integrations/direct/googleBusiness.ts`
- `src/lib/integrations/direct/facebook.ts`
- `src/lib/integrations/direct/instagram.ts`
- `src/lib/integrations/direct/tiktok.ts`
- `src/lib/integrations/direct/client.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.15 — 2026-06-30（Post 管理中 Draft 状态草稿一键智能排期）

### Post 管理面板中的草稿一键智能排期
- **编辑面板新增智能排期按钮**：对于现有状态为 `draft`（草稿）的 Post，在详情/编辑侧边抽屉中添加了“智能排期”操作按钮。
- **草稿卡片新增行内智能排期按钮**：重构了 `DraftCard` 渲染组件，当卡片状态为 `draft` 且非批量选择模式时，在卡片底部快捷展示“智能排期”轻量按钮。
- **排期自动挂载流程**：用户点击上述智能排期按钮时，系统会自动请求推荐排期时间 API，然后自动更新草稿排期时间，并调用 `/submit` 提交审核，以保证物流/推文等跑腿排期逻辑在三方通道中正确挂载并生成 platformPostId。

### 影响文件
- `src/components/dashboard/DraftManagementView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.16 — 2026-06-30（手动上传社媒快照与AI抓取防覆盖机制）

### 手动上传快照与AI抓取防覆盖机制
- **快照数据模型字段扩展**：`SocialAccountSnapshot` 表新增 `isUserUploaded` 与 `isReal` 字段，以区分用户手动上传的真实截图与 AI 爬虫采集的截图。
- **手动上传 API 路由**：新增 `/api/data-analysis/upload` 接口，支持用户手动上传快照截图，上传的截图自动标记为 `isUserUploaded: true` 且 `isReal: true`。
- **爬虫真实性判定 (Anti-Hallucination)**：在 `captureAccountSnapshot` 采集逻辑中，添加 `verifyRealProfile` 辅助函数。通过校验爬虫跳转后的实际 URL、页面关键词（如 followers / 粉丝数 / posts）等，确保爬虫真的抓取到了目标页面而不是登录墙或空白页。只有判定真实的截图才标记为 `isReal: true`，防止爬虫的假/失效截图覆盖用户上传的真截图。
- **查询与展示策略**：在 `/api/data-analysis` 接口获取快照时，优先返回最新的已验证为真实的快照 (`isReal: true`)，当且仅当不存在任何真实快照时才 fallback 回退显示最新采集的（无论真伪）快照。
- **UI交互优化**：在 `DataAnalysisView.tsx` 中整合文件上传控件，为没有快照的卡片添加“手动上传截图”按钮，并为已有快照的卡片悬浮状态下添加“上传截图”操作，实现点击快照直接覆盖更新。

### 影响文件
- `prisma/schema.prisma`
- `src/lib/captureSnapshots.ts`
- `src/app/api/data-analysis/route.ts`
- `src/app/api/data-analysis/upload/route.ts`
- `src/components/dashboard/DataAnalysisView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.17 — 2026-07-01（账号快照卡片重构与详情模态框实现）

### 账号快照展示页面重构
- **卡片纯图化展示**：重构了 `DataAnalysisView.tsx` 中的快照卡片组件，移除了原有卡片头部的品牌信息、主理人列表以及底部的统计与操作栏。卡片完全用于展示全屏截图快照以达到最佳的视觉展示效果。
- **快照完整展示**：卡片布局优化为 `aspect-[9/16]` 手机比例，并使用 `object-contain object-top` 布局确保全尺寸截图完整显示、不被裁剪，同时提供柔和的暗色背景渐变遮罩。
- **快照详情弹窗**：实现 `selectedAccount` 详情模态框。用户点击卡片后，弹出包含该账号所有元数据信息的双栏窗口。
  - **左侧**：展示完整未裁剪的大图截图。
  - **右侧**：汇总品牌名称、物理位置、平台名称、账号 Handle、绑定主理人列表、账号粉丝数、星级、快照生成及验证状态，并提供“访问主页”、“手动上传最新截图”和“重新登录并授权”快捷操作。
- **数据自动同步**：新增监听逻辑，在后台快照数据或上传截图更新后，模态框内展示的数据会自动与最新的 items 列表数据进行响应式同步更新。

### 影响文件
- `src/components/dashboard/DataAnalysisView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.18 — 2026-07-01（账号快照陈列卡片去除遮挡与布局优化）

### 账号快照展示与布局优化
- **无任何边框与标记展示**：卡片本身移除了所有背景色、边框线、阴影和内边距，快照图片上层亦无任何悬浮指示元素，呈现极致干净、无边框的截图本貌。
- **标题左上方展示**：将“品牌名”和“平台 - 上传时间”以极简标题形式，放置在截图的左上方（截图顶部之上），便于左右横向快速对比阅读。
- **不变形自适应布局**：移除了卡片强制的 `aspect-[9/16]` 手机外框限制及黑边填充，截图卡片和内部的图片均使用 `w-full h-auto` 自适应高度，保持原始快照截图的真实纵横比。未捕获快照的卡片则展示干净的虚线框占位图，保持网格对齐。

### 影响文件
- `src/components/dashboard/DataAnalysisView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.19 — 2026-07-01（电子大屏动态展示与分享URL页面）

### 电子屏分享大屏展示模式
- **公共数据查询接口**：新增公共快照查询接口 `/api/public/snapshots`。该接口不校验登录会话，仅查询 ACTIVE 状态的品牌和其最新的真实社媒账号快照，且严格排除了任何用户名/密码等敏感凭据。
- **电子屏专属大屏播放页 (`/presentation/share-tv-display-board`)**：
  - **默认密集贴纸网格墙（100% 屏效，默认4列）**：系统默认将所有快照以高密度的网格形式展示（默认 4 列宽松排版）。无页眉、无多余 UI 覆盖，使整个屏幕 100% 空间用于内容沉浸展示。
  - **拟物化贴纸飞入与弹性着陆效果 (Polaroid Sticker Fly-In)**：加载或换批时，每张社媒快照像贴纸一样从屏幕上方不同偏角坐标飞入，带有独特的旋转、缩放和微幅弹性反弹（Spring bounce）着陆特效，宛如实体相片粘在白板上。
  - **自动坠落与换批循环**：当前批次的快照在白板墙上静置展示 3 分钟（支持通过控制面板设定为 15 秒演示、30 秒、1 分钟、3 分钟、5 分钟等），停留期满后以重力加速度模式坠落并漂移出屏幕（Gravity fall-off）。在当前批次所有贴纸掉落完毕后，下一批贴纸紧接着飞入贴墙，实现全自动循环流转。
  - **错位悬浮呼吸微动**：快照贴墙静置期间，每个卡片仍带有微弱的悬浮和摆动呼吸感，各卡片的动画周期与延时完全随机（25秒~35秒），保持整面照片墙的灵动活力。
  - **底部触碰隐形控制台**：控制面板默认完全隐藏（`opacity-0`），只有当鼠标指针移入屏幕最下方的 120px 触碰区时才会以浮现（`opacity-100`），提供手动前后翻批、修改贴纸停置时长、网格列数密度（4/6/8列）、开关呼吸微动等设置。
  - **键盘快捷键操作**：支持 Space (强制掉落并换下一批)、ArrowLeft/Right (手动切换上一批/下一批)、F (全屏)、G (密集网格/单图模式切换)、H (键盘帮助) 键盘操作。
- **看板控制入口集成**：在账号展现看板 (`DataAnalysisView.tsx`) 头部新增“📺 电子大屏展示”按钮，点击可自动携带着当前看板的“品牌”及“平台”过滤参数在新标签页中打开 `/presentation/share-tv-display-board` 页面。

### 影响文件
- `src/app/api/public/snapshots/route.ts`
- `src/app/presentation/share-tv-display-board/page.tsx`
- `src/components/dashboard/DataAnalysisView.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.20 — 2026-07-01（电子大屏展示参数调整与动画优化）

### 电子屏分享大屏展示模式优化
- **单屏幕展示数量调整**：
  - 单屏幕默认展示数量从原先按列数计算（默认4个）调整为 `12` 个（采用 6 列 x 2 行的优雅布局，完美契合 16:9 电子大屏）。
  - 控制台新增单屏数量选择下拉框，支持选择：`12` 个（默认，6列）、`15` 个（5列）、`24` 个（8列）。
  - 自动根据选定的展示数量调整布局网格列数，优化卡片间距（Gap）与页边距，以获得最佳的满屏沉浸感。
- **柔和的飞入与落叶动画**：
  - **飞入效果（Sticker Fly-In）**：降低初始缩放倍数（1.8x -> 1.15x），缩减上方起始飞行高度与水平偏角偏移量，降低弹簧刚度（stiffness 65 -> 45）并提高阻尼比（damping 12 -> 18），使贴纸卡片飞入贴墙的效果更加温和、流畅、自然。
  - **落叶效果（Leaf Fall-Off）**：将重力加速度坠落动画改为柔和的“落叶式”漂浮坠落。时长从 1.0s 延长至 2.2s，采用 easeInOut 缓动平滑减速，并增大水平漂移和卡片缓慢翻转落下的动作，呈现灵动、柔和的落叶飘散意境。
- **持续展出时间缩短**：
  - 默认单批次贴纸停置展出时间由 3 分钟（180000ms）缩短至 `1分钟`（60000ms），满足更高频次的信息轮播展示需求。
  - 控制面板中的选择下拉框默认选项对应更新为 `1 分钟 (默认)`。
- **免登录公开访问支持**：
  - 在路由拦截代理 `src/proxy.ts` 中，将 `/presentation/` 路径添加为公开页面，使未登录的用户也可以直接访问电子大屏展示页，免去重定向至登录页。

### 影响文件
- `src/app/presentation/share-tv-display-board/page.tsx`
- `src/proxy.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.21 — 2026-07-01（发布与排期尊重用户选择时间）

### 智能排期优先尊重用户选择时间
- **手动排期时间锁定**：
  - 在统一投递函数 `submitDraftForDelivery` (`src/lib/draftSubmission.ts`) 及动作项审批路由 (`src/app/api/brands/[id]/actions/[aid]/approve/route.ts`) 中，新增对已设定的发布时间（`scheduledAt`）的尊重逻辑。
  - 只有当草稿的 `scheduledAt` 为 `null`/`undefined`（即 AI 员工生成未排期状态），或者用户在客户端明确点击并触发“智能重新排期/重新智能排期”时，系统才会请求推荐时段并覆盖该时刻。
  - 用户手动选择/拖拽排期的时间（包括由于时差或提交延迟导致稍处于过去的时间）将完整保留，不再无故被智能排期算法延后（如强行延至两天后），直接调用 PostFast 排期发布或即时发布。

### 影响文件
- `src/lib/draftSubmission.ts`
- `src/app/api/brands/[id]/actions/[aid]/approve/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.22 — 2026-07-01（智能排期按钮新增下拉选择与指定时间发布）

### 预览面板智能排期按钮交互升级
- **下拉菜单排期选择**：
  - 将多平台预览模态框（`PostPreviewModal.tsx`）底部的“智能排期”按钮升级为分立的下拉组合按钮（Split Button）。
  - 点击左侧主体直接执行“智能排期”（系统自动推荐最佳时间）。
  - 点击右侧下拉箭头浮现设置面板，提供两个核心选项：
    1. **智能自动排期 (推荐)**：使用智能排期算法自动推荐最佳发布时段并提交审核。
    2. **按设定时间排期**：提供标准的 `datetime-local` 时间选择器，支持用户指定特定的年月日与时分，点击“确认排期发布”即可将推文草稿直接设定为所选定的排期时刻并提交发布管线。
- **发布日历与排期管理适配**：
  - 更新 `DraftManagementView.tsx` 及 `DashboardCalendar.tsx` 的排期提交函数，使其支持接收可选的 `customTime` 参数，完成从模态框到后台 API 的打通。

### 影响文件
- `src/components/dashboard/PostPreviewModal.tsx`
- `src/components/dashboard/DraftManagementView.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.23 — 2026-07-01（账号删除能力与取消订阅过滤优化）

### 账号管理与删除能力
- **前端删除操作**：在 `DashboardHome.tsx` 的每个社交账号卡片（`KpiCard`）右上角新增删除（垃圾桶）图标。用户点击并二次确认后，直接调用 DELETE 接口，成功后自动刷新账号配置。
- **前端新增渠道入口**：在“账号资产配置”标题右侧新增“+ 绑定新账号”按钮，连通已有的 `AddAccountModal`，让主理人可以自助添加绑定社交媒体账号。
- **后端依赖级删除支持**：更新 `/api/brands/[id]/accounts/[aid]` 的 `DELETE` 接口，在删除 `SocialAccount` 前，同步以事务形式安全清除关联 of `ActionItem` 和 `ContentDraft` 数据，避免违反外键约束。

### 取消订阅账号看板过滤
- **账号快照过滤**：在 `/api/data-analysis` 与 `/api/public/snapshots` 接口中，只查询并展现对应品牌拥有当前有效（未到期且 status 为 ACTIVE）的订阅计划的社媒账号快照。
- **数据分析服务拦截**：在 `/api/brands/[id]/social-insight` 数据分析接口中添加校验：若该品牌当前没有有效的激活订阅计划，则直接返回 `402 Payment Required` 状态，并提示相应错误说明，使前端能够准确渲染订阅已取消/未激活的友好阻断提示。

### 影响文件
- `src/app/api/brands/[id]/accounts/[aid]/route.ts`
- `src/components/dashboard/DashboardHome.tsx`
- `src/app/api/data-analysis/route.ts`
- `src/app/api/public/snapshots/route.ts`
- `src/app/api/brands/[id]/social-insight/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.24 — 2026-07-01（草稿编辑页提交按钮删除与手动时间排期尊重）

### 草稿编辑按钮精简
- **去掉提交草稿按钮**：在 Post 草稿编辑面板侧边抽屉（`DraftManagementView.tsx`）底部，完全移除“提交草稿”按钮，使用户仅能进行预览、废弃、保存、AI 创作与智能排期操作，简化发帖前的决策路径。

### 手动指定发布时间在智能排期中的尊重逻辑
- **尊重未来排期时间**：
  - 更新 `handleSingleSmartSchedule` 和 `handleSmartScheduleFromModal`（在 `DraftManagementView.tsx` 中）以及 `handleSchedulePublish`（在 `DashboardCalendar.tsx` 中）的智能排期实现。
  - 当检测到用户已经在编辑面板上自主选择了未来的指定发布时间（即 `scheduledAt` 为未来的某个时间段）时，点击“智能排期”不再向 `/api/brands/[id]/scheduling/recommend` 获取系统推荐的时间，而是直接锁定并采用用户设定的时间提交排期，实现“双剑合璧”的业务灵活性。

### 预览效果弹窗优化
- **预览只生成预览图**：为 `PostPreviewModal` 组件引入 `previewOnly` 属性。
- **隐藏底部控制栏**：当点击草稿编辑页/日历的“预览效果”打开弹窗时，系统传入 `previewOnly={true}`，隐藏预览弹窗底部的“取消创作”、“重新生成”、“保存草稿”、“智能排期”等全部四个操作按钮，防止多层弹窗/抽屉按钮功能冲突。

### 影响文件
- `src/components/dashboard/PostPreviewModal.tsx`
- `src/components/dashboard/DraftManagementView.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.25 — 2026-07-01（套餐合同时长限制与邀请码自动校验）

### 套餐合同时长逻辑调整
- **基础自媒体运营套餐限制**：当用户选择“自媒体基础运营”（$600 套餐，即 `starter` 方案）时，前端不再展示“3 个月”的合同时长选项。
- **自动升档调整**：若用户在选择 $2800 品牌建设套餐时选择了“3 个月”时长，随后切换到“自媒体基础运营”套餐时，系统将自动将时长修改并锁定在“6 个月”，确保状态的一致性与合法性。

### 邀请/优惠码核销自动校验
- **去掉核销优惠按钮**：完全移除新建品牌向导（`NewBrandWizard.tsx`）和套餐订阅激活页面（`SubscriptionClient.tsx`）中的“核销优惠”手动触发按钮。
- **输入框静默自动核销**：在邀请码/优惠码输入框中集成了 500ms 的 debounce 监听。用户输入完毕停止打字 500ms 后，系统将自动调用接口进行核销，同时在输入框右侧内嵌展示优雅的加载动画（Spinner Loop），计算完成后实时输出折扣信息。

### 影响文件
- `src/components/brands/NewBrandWizard.tsx`
- `src/app/board/subscription/SubscriptionClient.tsx`
- `docs/prd_amc.md`

---

## Changelog v1.8.26 — 2026-07-01（Post 编辑表单与状态按钮统一重构）

### Post 编辑表单组件化与统一
- **抽取统一 PostEditDrawer 组件**：将原先内嵌在 `DraftManagementView.tsx` 中的侧边编辑抽屉，抽取为独立的通用组件 `PostEditDrawer.tsx`。
- **状态感知与动态表单行为**：
  - 新增/编辑表单整合：当 `postId` 传入 `null` 时自动切换为“新建草稿”模式；传入具体 ID 时自动加载已有数据。
  - 输入框禁用规则：仅在 post 处于 `published` / `done` 状态时，表单的所有输入项（文案、标签、账号、排期时间、媒体库等）才切换为只读状态。
- **不同状态按钮动态适配**：
  - **Draft / Failed (草稿 / 生成失败)**：显示 `预览效果`、`废弃`、`✨ AI 创作`、`保存`、`智能排期` 按钮。
  - **Pending Review (待审核)**：显示 `预览效果`、`废弃`、`保存`、`✨ AI 重新创作`、`驳回`、`批准` 按钮。
  - **Scheduled (已排期)**：显示 `预览效果`、`取消排期` (即废弃)、`保存` (保存文案及指定时间修改)、`立即发布`、`重新智能排期` 按钮。
  - **Published / Done (已发布 / 已完成)**：只读模式，仅显示 `预览效果` 和 `打开已发布文章` 按钮。

### 日历视图与草稿视图统一接入
- **删除冗余日历详情侧栏与编辑表单**：在 `DashboardCalendar.tsx` 中，完全移除原先用于展示只读详情的 `aside` 侧边栏和内嵌的 `isCreatingPost` 重复表单，统一使用新抽取的 `<PostEditDrawer>`。
- **双向无缝编辑支持**：在日历中点击任何排期帖、待审核帖或已发布帖，直接唤起统一的 `<PostEditDrawer>` 渲染，允许直接在日历中对已排期/待审核内容进行即时修改并保存，或执行状态流转（如立即发布、批准/驳回、取消排期等）。

### 影响文件
- `src/components/dashboard/PostEditDrawer.tsx`
- `src/components/dashboard/DraftManagementView.tsx`
- `src/components/dashboard/DashboardCalendar.tsx`
- `docs/prd_amc.md`

---

## 用户、组织与权限管理（当前有效方案）

> 以下为已确认的目标状态，当前代码尚未完成迁移。执行状态与启动门以 [`prd_user_organization_permissions.md`](./prd_user_organization_permissions.md) 为准。

- 人类和 AMC Agent 都是正常 `User`，使用相同的显式角色、Capability 和品牌范围判断。
- `UserBusinessRole` 是全局角色唯一来源；一个用户可以拥有多个角色，权限取 Capability 并集。
- `CrewMember` 是唯一直接品牌权限关系；`BrandOwner`、`BrandAgent`、`AgentPermission` 和 `Brand.ownerId` 不再参与运行时授权。
- 组织成员通过 Organization Owner 的有效 CrewMember 自动继承品牌范围；退出组织后继承立即失效，直接 CrewMember 不受影响。
- AMC Agent 使用绑定自身 User 的专属 API Key。旧 Human Key + `x-agent-id` 仅保留 24 小时迁移窗口。
- AMC Agent 获得 `ADMIN` 后，与人类 ADMIN 具有完全相同的权限；`actorType` 只用于工作日志。
- 网页、REST API 和 MCP 使用统一 `AuthPrincipal`、Capability、业务服务和工作日志。
- 新密码使用 Argon2id；旧 bcrypt 在成功登录时渐进升级。

完整执行规范见 [`prd_user_organization_permissions.md`](./prd_user_organization_permissions.md)。

---

## Changelog v1.8.28 — 2026-07-02（已发布内容贴文链接持久化与缓存优化）

### 已发布内容贴文链接持久化
- **数据库 Schema 字段扩展**：在 `ContentDraft` 模型中新增可选字段 `postUrl` 用以保存帖文的最终发布链接。
- **发布路由链接保存**：
  - 更新自动发布、手动审核通过发布、重试发布等场景的后端逻辑，在发布成功并获得 `postId` 的同时，捕获 PostFast 返回的 `url` 并直接将其作为 `postUrl` 写入 `ContentDraft`。
  - 在智能体上报发布状态 `/api/agent/pending-approvals` 时，支持 payload 接收并更新 `postUrl` 字段。

### 读时缓存与分页容灾机制 (Read-Through Cache)
- **草稿与日历接口适配**：在获取草稿列表和日历视图接口中，如果对应草稿的 `status` 为 `published` 且拥有 `platformPostId`，但数据库内 `postUrl` 缺失时，才调用 PostFast 获取在线贴文列表。
- **回写缓存持久化**：获取到在线数据后，系统会自动在内存中匹配并向数据库发起写回更新（Writeback Cache），将匹配到的 `postUrl` 缓存写入 `ContentDraft`。下一次用户或其他组件访问该内容时，直接走数据库读取，无需再次调用外部 API，彻底解决老帖文被分页挤出而导致链接丢失的缺陷。

### 影响文件
- `prisma/schema.prisma`
- `src/agents/nodes/publisher.ts`
- `src/app/api/tasks/[id]/retry-publish/route.ts`
- `src/app/api/brands/[id]/actions/[aid]/approve/route.ts`
- `src/app/api/agent/action-items/route.ts`
- `src/app/api/agent/pending-approvals/route.ts`
- `src/app/api/brands/[id]/drafts/route.ts`
- `src/app/api/brands/[id]/drafts/[draftId]/route.ts`
- `src/app/api/dashboard/calendar/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.29 — 2026-07-02（主理人看板独立地图页面设计方案）

### 独立地图视图与多市场切换设计（设计阶段）
- **独立路由与入口设计**：
  - 将地图视图设计为单独的页面路由 `/profile/principal/map`。
  - 在 `/profile/principal` 主理人看板首页的“品牌列表”区域右上角增设“🗺️ 查看地图分布”按钮，作为进入该页面的入口。
- **复用 Brand.location 字段与默认中心（Singapore）**：
  - **无需新增数据库的 market 字段**，直接复用 `Brand` 品牌表中已有的 `location` 字段作为国家/市场过滤属性。
  - 地图页面顶部配置“市场切换”下拉菜单，**当前版本默认选择并锁定在新加坡（Singapore）**，对应过滤 `location === "Singapore"` 且地图中心初始化在新加坡坐标。
  - 长期规划支持主理人切换至其他市场（如吉隆坡 Kuala Lumpur、雅加达 Jakarta 等），通过匹配 `location` 字段按区域过滤。
- **数据库 Schema 坐标设计扩展**：
  - 在 `Brand` 模型中规划新增 `latitude`（纬度）和 `longitude`（经度）字段，并预留 Geocoding 逻辑将地址（address）异步转换并填入坐标。
- **信息卡片与多维 Research 数据展现（成果载体）**：
  - **简化卡片展现内容**：气泡窗口**不用展示 AI 员工，也不用展示待办事项**。仅展示**商家数据**（名称、Logo、地址、官网链接）以及 **Research 调研成果**（如 Google Place Details 评分、营业时间、消费者热门评价，并为未来的竞品分析、区域人口统计等调研成果预留卡片区块）。
- **地址搜索添加与点位绑定入口**：
  - 在地图页面设计中新增一个“🔍 搜索绑定门店地址”的输入框（集成 Google Places Autocomplete 自动补全）。
  - 若主理人在创建新品牌商家时未能成功采集或解析到完整的坐标与地址，可以在此直接输入门面名称或地址进行搜索。
  - 选择正确的 Google 门店位置后，弹出确认气泡/弹窗以将其绑定至指定的 Brand 实例。确认后，系统自动将查出的 `googlePlaceId`、`address` 及 `latitude`/`longitude` 坐标写回数据库中的该 `Brand` 纪录，并即时在地图上生成并渲染打点 Marker，大幅提高位置容错性。

### 影响文件
- `docs/prd_amc.md`

---

## Changelog v1.8.31 — 2026-07-02（Render 生产部署安全与易失性存储云端适配）

### 1. 生产环境数据库部署安全性升级
- **安全替换部署指令**：在 `render.yaml` 中，将构建阶段使用的 `npx prisma db push --accept-data-loss` 彻底替换为安全的生产数据库迁移命令 `npx prisma migrate deploy`。
- **防止数据丢失**：通过停用 `--accept-data-loss` 选项，避免因表结构非兼容变更导致生产数据库历史数据发生意外静默擦除。

### 2. 爬虫截图临时存储云端化与 OBS 适配
- **易失性容器适配**：在 `src/lib/captureSnapshots.ts` 中，截图功能将优先检测并适配华为 OBS 云存储服务。当检测到华为 OBS 配置可用时，自动将截图上传至 OBS 桶中。
- **清除临时物理文件**：上传云存储成功后，系统自动清理保存在临时文件系统（ephemeral container filesystem）中的 PNG 本地文件，彻底解决 Render 容器重启或水平扩展时，本地物理文件丢失引发前端访问 404 的隐患。
- **本地开发无感回退**：若云存储配置不可用（例如在本地离线开发阶段），系统将自动无缝回退至写入本地磁盘的旧逻辑，确保本地调测环境平滑不受影响。

### 3. AI Marketing Crew 改名与合格主理人入驻支持
- **专属团队功能改名**：在品牌管理控制台（BrandsTab）中，将“分配负责该品牌的专属 AI 团队 (AI Agents)”正式更名为 **AI Marketing Crew**。
- **合格主理人多选加入**：多选项扩展为允许从合格人类用户（排除单一只有品牌主身份的用户，保留管理员、运营端主理人/Principal、BD 等）以及所有 AI Agents 中，混合选择添加为品牌的 Crew 成员。
- **后端成员类型校验放宽**：在 PATCH `/api/admin/brands/[id]` 接口中，移除限制 `agentIds` 列表必须全为 `type === 'AI_AGENT'` 的强类型校验，只需确保传入的成员 ID 在用户表中合法即可。这使得人类主理人能够安全保存至品牌 Worker 列表中，并在多租户 RLS 及扁平化身份链中作为统一的 `CrewMember` 生效。

### 影响文件
- `render.yaml`
- `src/lib/captureSnapshots.ts`
- `src/components/admin/BrandsTab.tsx`
- `src/app/api/admin/brands/[id]/route.ts`
- `docs/prd_amc.md`

---

## Changelog v1.8.32 — 2026-07-02（托管品牌管理界面重构与运行状态冗余清理）

### 1. 移除冗余“运行状态”并统一读取“订阅状态”
- **移除冗余开关**：去除了品牌详情设置中的“运行状态”选择器。
- **状态逻辑重定向**：将原先读取和展示运行状态（Brand.status = ACTIVE/PAUSED）的逻辑，重定向为读取和展示该品牌的最新“订阅付款状态”（BrandSubscription.status = ACTIVE/PENDING/FAILED/CANCELLED）。
- **过滤与显示升级**：支持按全部、ACTIVE、PENDING、FAILED、CANCELLED 五种状态对托管品牌进行列表筛选和彩药丸徽章状态展示。

### 2. 品牌主下拉列表过滤修复
- **独立人选集**：将“主理人/业主 (Brand Owner)”下拉选择框的数据源，从过滤后的 `filteredHumans`（排除了纯品牌主身份的用户）改回 unfiltered `humans` 全量人类用户。
- **防止空置错误**：解决之前因纯品牌主身份用户被过滤隐藏，导致下拉框无法回显已绑定业主的 ID，从而渲染为“未设置”的显示及保存 Bug。
- **Crew 成员隔离保留**：继续在 "AI Marketing Crew" 成员列表中保留 `filteredHumans` 的规则，确保运营层面的 AI 员工和督导团队中不会混入其他商家的纯业主账号。

### 3. cramp 视图升级为全宽表格与编辑弹窗 (Table + Modal UX)
- **宽表展现形式**：抛弃左右分栏（col-span-4 对 col-span-8）的局促排版，将品牌列表升级为全局占比的响应式高雅数据表。
- **多维信息汇聚**：在列表中直接渲染：品牌名称、国家/城市（MapPin 标记）、订阅套餐等级、最新订阅状态、过期日期（过期的红字警示）、团队成员头像/昵称组（图标平铺）。
- **弹窗编辑 (Edit Modal)**：点击数据表的任意行，弹出精心打磨、支持深色模式的 `EditBrandModal`，可在宽敞的视野下完成对品牌资产、商业计划及 Crew 分配的统一保存。

### 影响文件
- `docs/prd_amc.md`
- `src/components/admin/BrandsTab.tsx`
- `src/app/profile/principal/page.tsx`
- `src/app/api/profile/principal-dashboard/route.ts`

---

## Changelog v1.8.33 — 2026-07-02（数据库事务优化与 500 超时报错修复）

### 1. 降低 Prisma 事务范围 (Minimize Transaction Scope)
- **事务范围缩减**：将新品牌注册与付款激活事务（`createBrandForActivatedSubscription`）以及品牌创建向导事务中的 `$transaction` 限制为仅执行核心的品牌创建与订阅绑定，避免元数据写入过多导致 5 秒超时。
- **事务外异步/同步写入**：将 Marketing Crew 创建、成员绑定、邀请码使用、裂变推荐以及老版本兼容性字段 upsert 等辅助数据库写入移出交互式事务。

### 影响文件
- `docs/prd_amc.md`
- `src/lib/subscription/service.ts`
- `src/app/api/brands/route.ts`
- `src/app/api/mm/brands/route.ts`

---

## Changelog v1.8.34 — 2026-07-03（移除自助订阅页面 & 遗留 AI Agent 关联逻辑清理）

### 1. 移除 `/board/subscription` 自助订阅购买页面
- **决策**：看板端的自助订阅购买页面（`SubscriptionClient.tsx`, 83KB）完整删除。
- **原因**：品牌创建与订阅计划开通流程统一收归至 Admin 后台（看板端）和 MM 端，不再需要独立的自助 Stripe 结账页面入口。
- **影响**：所有指向 `/board/subscription` 的导航入口已替换为 `/admin` 或移除。

### 2. 移除 `ensureBrandAgentKeyAfterSubscription` 遗留逻辑
- **决策**：彻底删除该函数及其全部调用点（约 185 行代码）。
- **原因**：品牌不再与 AI Agent 账号绑定，AI 员工由主理人手动添加至 Marketing Crew。
- **影响文件**：`service.ts`, `stripe/webhook`, `admin/subscriptions/[id]`, `subscription/confirm`, `mm/subscription`, `subscription/route.ts`

---

## 品牌创建业务逻辑规范（架构澄清 2026-07-03）

### 核心原则
1. **一体化流程**：创建品牌与开通服务计划（subscription）必须同步完成，不拆分。
2. **品牌归属识别**：品牌主（Brand Owner）通过邮件地址识别。系统自动查找或创建对应账号，并将品牌 owner 权限赋予该账号。
3. **主理人自动分配**：品牌创建成功后，系统自动从主理人分配池（Assignment Pool）中分派一名主理人（`AMC_PRINCIPAL`）。分配失败不阻塞流程，Admin 可事后手动在 AMC Crew 中添加成员。
4. **Marketing Crew 初始化**：品牌创建时同步初始化空的 `MarketingCrew`，品牌主和 AMC Agent 均可被添加为 Crew 成员。

### 两个入口点

| 入口 | 使用方 | 位置 | 品牌主信息 |
|------|--------|------|-----------|
| 看板端"添加新品牌" | Admin、主理人 | BrandSwitcher 下拉菜单 → 跳转 `/admin` → BrandsTab「新建品牌」 | **手动填写品牌主邮件** |
| MM 端"添加新品牌" | 品牌主自助、BD 代操作 | AMC-MM 应用内表单 | **从登录用户信息自动读取** |

### 角色权限总结

| 角色 | 说明 | 权限 |
|------|------|------|
| 品牌主 (Brand Owner) | 品牌的最高所有者，按邮件识别 | 对品牌内容、设置拥有最高权限 |
| Admin | 系统最高管理员 | 可操作所有系统数据 |
| 主理人 (AMC Principal) | 由 Admin 从主理人池指派 | 可作为品牌 Marketing Crew 成员 |
| AMC Agent | AI 智能体 | 可作为品牌 Marketing Crew 成员 |

### 待实现（看板端入口重建）
- **BrandSwitcher"添加新品牌"**：恢复按钮，指向 `/admin`（而非已删除的 `/board/subscription`）。
- **Admin BrandsTab「新建品牌」表单**：与 MM 端逻辑完全一致的创建表单，额外包含"品牌主邮件"字段，调用相同的 `createBrandForActivatedSubscription` 服务层逻辑。

---

## Changelog

### 2026-07-03 | fix(assets): 修复 presign-upload 接口 25s 超时（504）

**问题根因**：
- amc-mm 上传素材时，先向 amc-kanban 请求 presigned URL（`GET /api/brands/[id]/assets/presign-upload`）
- 该接口生成签名本身是纯同步 crypto 操作（毫秒级），但在此之前的 Auth 和 品牌鉴权 会发出 4-5 条串行 Prisma 查询
- 在 Render 托管的 PostgreSQL 上，当连接池被其他长任务耗尽时，这些串行查询会全部排队等待，导致整个请求超时 25s

**决策**：
- 所有用户统一使用 Auth V2；JWT 只携带最小身份 Claims，不允许 ADMIN 通过旧角色 Claim 绕过账号状态、显式角色或 `authVersion` 检查。
- Session 身份与显式角色最多执行 1 次查询；品牌范围最多执行 1 次额外查询。
- 品牌范围只检查有效 CrewMember，以及通过 Organization Owner CrewMember 获得的组织继承，不再检查 `ownerId` 或其他旧授权表。
- 添加分阶段耗时日志（`[presign]`），便于在 Render 日志中精确定位未来潜在瓶颈

**同期修复（amc-mm 侧）**：
- `BrandOwnerDashboard.tsx` 中已补回 presign 502/504 时自动 fallback 到旧版 `/api/brands/[id]/assets/upload`
- fallback 仅对文件大小 <= 10MB 生效（Render 请求体大小限制）

---

### 2026-07-03 | feat(tts): 切换语音引擎为 MiniMax TTS，废弃 Azure TTS

**决策**：完全停用 Azure Cognitive Speech TTS，改用 MiniMax TTS（speech-2.8-turbo 模型）。

**实施内容**：
- 新增 amc-kanban `/api/mm/tts-proxy` 路由：从 SystemConfig DB 读取 MiniMax API Key，直接调用 MiniMax T2A v2 接口，返回 MP3 音频流
- 新增 `getMiniMaxApiKey()` helper 于 `systemConfig.ts`
- Admin UI（全局 AI 秘钥 Accordion）新增 MiniMax TTS API Key 配置项，key 入库不走 Render 环境变量
- 删除 amc-kanban `/api/speech-token` 及 amc-mm `/api/mm/speech-token` 两个废弃路由
- 删除 `getAzureSpeechConfig()` 函数及 `azureSpeechKey/azureSpeechRegion` Prisma 字段
- `SettingsSubPage.tsx` 语音列表从 Azure Neural 语音改为 MiniMax 5 种中文音色（暖姐/活力妹/知性姐/稳哥/播音）
- 默认音色从 `zh-CN-XiaoxiaoNeural` 改为 `Chinese (Mandarin)_Warm_Bestie`
- 数据库迁移：`20260703000001` 添加 `minimaxApiKey` 列、`20260703000002` 种入 API Key、`20260703000003` 删除 `azureSpeechKey/azureSpeechRegion` 列

---

## Changelog v1.8.35 — 2026-07-03（代码库瘦身与性能清理）

**背景**：代码库膨胀至 82,685 行 / 324 文件，dev/tsc 速度慢，需系统性清理。

### Phase 1 — 死代码删除（-12 文件，~3,962 行）

| 删除文件 | 原因 |
|----------|------|
| `src/app/mock-merchant/` (5 files) | 本地测试 mock，无生产入口 |
| `src/app/faq/page.tsx` (1,025行) | 无内部导航链接 |
| `src/app/game/[brandId]/page.tsx` (1,386行) | 已由 `/board/game` 替代 |
| `src/app/board/agents/page.tsx` | 无引用 |
| `src/app/board/game/poster/[brandId]/page.tsx` | 无引用 |

**构建配置优化**：
- `next.config.js`：移除 8 个多余的 `micromark-*` transpilePackages
- `tsconfig.json`：新增 `tsBuildInfoFile: ".next/tsbuildinfo"` 开启增量 tsc 缓存

### Phase 2a — 大文件组件化（MMDashboard.tsx: 3,037 → 2,350 行）

- 提取 `MMSubPageOverlay.tsx`：calendar / assets / market / settings 4 个子页面内联 JSX
- 提取 `MMSideMenu.tsx`：右滑抽屉导航菜单（品牌切换 + 导航 + 订阅展示）

### Phase 3 — 数据库查询优化

- `social-insight/route.ts`：为 `conversionEvent.findMany`（×2）和 `auditLog.findFirst` 添加 `select`
- `drafts/route.ts`：N 条串行 DB 写入改为单条 `prisma.$transaction([...updates])`

**净效果**：约 -12 文件，-4,700 行代码，tsc 增量加速。

---

### v1.8.36 — 2026-07-03 · Critical Fix: Prisma 连接池耗尽 + OBS 签名 + MiniMax TTS

**背景**：生产环境所有 API 接口出现 25 秒超时（presign-upload 504、TTS 502/503、assets/upload 502），监控日志显示每秒十几条来自 amc-mm IP 的 25s 超时请求。

---

**修复 1 — Prisma 单例 Bug（根本原因）**
- 文件：`src/lib/prisma.ts`
- 问题：`globalForPrisma.prisma = basePrisma` 仅在非生产环境执行。生产环境每个请求均创建新 PrismaClient，每个带默认10连接池，并发请求打满 PostgreSQL max_connections → 所有查询挂起25s
- 修复：改为所有环境均缓存单例；同时加 `connection_limit=10&pool_timeout=20` 到 DATABASE_URL，防止单实例打满连接

**修复 2 — OBS Presigned URL 签名**
- 文件：`src/lib/integrations/huaweiObs.ts`
- 问题：`getHuaweiObsPresignedPutUrl()` 将 `Content-Type` 纳入 `SignedHeaders`（`content-type;host`）。浏览器 fetch 发送二进制 PUT 时可能修改 Content-Type（如追加 charset），导致 OBS 返回 403 SignatureDoesNotMatch
- 修复：`SignedHeaders` 改为仅 `host`，不签 Content-Type

**修复 3 — MiniMax TTS API Key 丢失（503）**
- 文件：`src/lib/systemConfig.ts`，新增 `prisma/migrations/20260703000004_reseed_minimax_key/migration.sql`
- 问题：migration 000002 在 SystemConfig 行创建前执行，ON CONFLICT 无效；后来 `ensureSystemConfig()` 创建了行但没有 `minimaxApiKey` 字段 → null → tts-proxy 返回 503
- 修复：
  1. `ensureSystemConfig()` create 中添加 `minimaxApiKey: env || null`
  2. `getMiniMaxApiKey()` 读到 null 时自动从 env var backfill 并写回 DB
  3. Migration 000004：COALESCE UPSERT，只填 null 不覆盖 Admin UI 已有值

**影响文件（amc-kanban）**：
- `src/lib/prisma.ts`
- `src/lib/systemConfig.ts`
- `src/lib/integrations/huaweiObs.ts`
- `prisma/migrations/20260703000004_reseed_minimax_key/migration.sql`

**影响文件（amc-mm）**：
---

## Changelog v1.8.37 — 2026-07-04 · Postfast 帖子分析数据每日同步入库

### 背景

`/api/brands/:id/social-insight` 每次请求时实时调用 Postfast API 拉取帖子分析数据，存在以下问题：
- Postfast API 超时 / 不可用时，数据分析页直接报错
- 无法积累历史数据（Postfast 只返回当前实时数据）
- 每次页面加载都产生 Postfast API 调用，增加外部依赖

### 决策

在现有的每日 cron 同步 (`/api/cron/postfast-sync-all`) 中，增加近 9 天帖子分析数据的同步，缓存到 `brand.postfastSnapshot.analyticsPosts[]`。

`social-insight` 路由改为优先读 DB 缓存，Postfast 实时 API 作为 fallback（仅当 DB 无缓存数据时调用）。

### 实现范围

**amc-kanban**：
- `src/app/api/cron/postfast-sync-all/route.ts`：`syncBrand()` 新增第 3 步，调用 `postfastGetAnalytics()` 拉近 9 天数据，写入 `postfastSnapshot.analyticsPosts`
- `src/app/api/brands/[id]/social-insight/route.ts`：`fetchPostfastPosts()` 改为 DB-first 模式（读 `brand.postfastSnapshot.analyticsPosts`），无缓存时 fallback 到实时 API

### 数据结构（`brand.postfastSnapshot`）

```json
{
  "accounts": [...],
  "operationsReport": {...},
  "analyticsPosts": [
    {
      "id": "pf_xxx",
      "content": "...",
      "socialMediaId": "...",
      "publishedAt": "2026-06-25T...",
      "latestMetric": {
        "likes": "12", "comments": "3", "shares": "1",
        "impressions": "450", "reach": "380"
      }
    }
  ],
  "analyticsUpdatedAt": "2026-07-04T02:00:00.000Z"
}
- `src/components/BrandOwnerDashboard.tsx`：OBS PUT 失败时降级到 server-side 上传；greeting 重复 speak 去重（`_sessionGreetingSpokenTexts`）

---

## AIERA v2 — AI 内容生产引擎（2026-07 新增模块）

> 详细设计见 `docs/prd_aiera_v2.md`

### 模块概述

AIERA（AI Era Architecture）是 AMC-Kanban Copywriter Agent 的下一代架构，包含六大升级方向：

1. **Copywriter 智能升级**：三阶段流水线（意图理解→Hook竞选→Body精炼），消除 AI 腔，Hook 多样化
2. **开源 Skill 加载**：文件系统 + DB 配置动态加载平台创作规范，无需重新部署
3. **内部知识库**：KnowledgeEntry + pgvector，将人工修改后的优质内容沉淀为可检索知识
4. **平台专属 Skill**：每个平台（小红书/Instagram/TikTok/Facebook/GBP）独立 SKILL.md 维护
5. **高并发架构**：BullMQ + Redis Worker Pool，支持 100+ 品牌并发
6. **图生视频 + 脚本写作**：Script Writer Agent + Kling/Runway API 集成

### 实施状态

| Phase | 功能 | 状态 |
|-------|------|------|
| Phase 1 | Hook 多样化 + 随机选取 | ✅ 完成 |
| Phase 1 | 5 个平台 SKILL.md 文件 | ✅ 完成 |
| Phase 1 | Skill 动态加载器 (skillLoader.ts) | ✅ 完成 |
| Phase 1 | Copywriter 集成 Skill 注入 | ✅ 完成 |
| Phase 2 | 知识库 KnowledgeEntry + pgvector | 计划中 |
| Phase 3 | BullMQ Worker 队列 | 计划中 |
| Phase 4 | 图生视频 + Script Writer | 计划中 |

### Skill 文件位置

src/agents/skills/
├── platforms/
│   ├── xiaohongshu/SKILL.md
│   ├── instagram/SKILL.md
│   ├── tiktok/SKILL.md
│   ├── facebook/SKILL.md
│   └── google_business/SKILL.md
└── skillLoader.ts
```

---

## AI 模型路由架构（当前实现状态）

> 已实现。2026-07-04 完成从 SystemConfig hardcode → LLMConfig 统一配置的迁移。

### 核心原则

**所有 AI 模型调用统一通过 `LLMConfig` 表驱动，无任何 hardcode 模型或 API key。**

- 不同场景（文案生成、语音伴侣、TTS、多模态）通过 `taskTags` 字段区分
- 优先级由 `priority` 字段控制（数值越高越优先）
- 断路器（Circuit Breaker）自动跳过 5 分钟内限流（429）的模型
- Admin → AI 模型配置 是唯一的 key 管理入口

### 路由路径

| 场景 | taskTag | 调用路径 |
|------|---------|---------|
| 文案生成、评论回复 | `copywriting` | `callLLM('copywriting')` → `llmRouter.ts` |
| AI 语音伴侣对话 | `companion` | `callLLMChat('companion')` → `llmRouter.ts` |
| 商家端 TTS 语音合成 | `tts` | `tts-proxy/route.ts` → `LLMConfig[tts]` → MiniMax T2A API |
| 多模态图像分析 | `google` provider | `generateMultimodalText()` → `LLMConfig[provider=google]` |
| 管理后台 AI 建议 | `companion` | browser → `/api/llm/chat` → `callLLMChat` |

### 关键文件

```
src/lib/llmRouter.ts        — 核心路由，callLLM() + callLLMChat()，含断路器
src/lib/gemini-chat.ts      — 语音伴侣专用 chat，LLMConfig 驱动
src/lib/gemini.ts           — generateText / generateMultimodalText（均走 LLMConfig）
src/lib/gemini-direct.ts    — 浏览器端 LLM 调用封装（现已改为 POST /api/llm/chat）
src/app/api/llm/chat/       — 通用服务端 LLM chat 端点，供前端组件调用
src/app/api/mm/tts-proxy/   — MiniMax TTS 代理，key 来自 LLMConfig[tts]
```

### 已废弃（不再使用）

- `SystemConfig.geminiApiKey` — 字段保留但代码不再读取，AI key 请配置在 LLMConfig
- `SystemConfig.minimaxApiKey` — 同上，MiniMax TTS key 已迁移至 LLMConfig[tts]
- 浏览器直调 Google Generative Language API — 已改为服务端路由

### 配置管理

Admin → AI 模型配置 页面：
- 新增/编辑/删除 LLMConfig 记录
- 调整 priority 控制使用顺序
- 按 taskTags 为不同场景指定专用模型
- 断路器状态查看（哪些模型当前被限流）

## Changelog v1.8.37 — 2026-07-05（密码重置与用户资料修复）

### 自助找回密码 (Self-Service Forgot Password)
- **登录页新增「忘记密码？」入口**：点击后弹出 inline 邮箱输入框（无需跳页）。
- **`POST /api/auth/forgot-password`**：接收邮箱 → 生成 `PasswordResetToken`（15 分钟有效）→ 发送安全重置链接邮件。无论邮箱是否存在均返回 200（防账号枚举）。
- **`GET/POST /api/auth/reset-password`**：GET 验证 token 有效性；POST 消耗 token + 更新密码 + authVersion++ 。
- **新页面 `/reset-password/[token]`**：含密码强度指示器的精美重置表单，三个状态：验证中 / 表单 / 成功。

### 管理员重置密码改造
- **废弃临时密码机制**：管理员点击「重置密码」不再设置随机临时密码，改为创建 `PasswordResetToken`（24 小时有效）并发送安全重置链接邮件给用户。
- **Admin UI 更新**：按钮从「密码初始化」改为「重置密码」；确认弹窗描述更新。
- **SMTP 未配置时 fallback**：Admin 结果弹窗直接展示重置链接（可复制后手动转发给用户）。

### 用户资料 Bug 修复
- **`PATCH /api/profile`（JSON 路径）**：修复 `introduction`（身份简介）字段在 JSON body 请求时被静默丢弃的问题，现在 nickname 和 introduction 均可正确保存。

### 数据库变更
- 新增 `PasswordResetToken` 模型：`id, userId, token (unique), expiresAt, usedAt (nullable), createdAt`。

### amc-mm 同步
- 新增 `/api/auth/forgot-password` 代理路由（转发至 amc-kanban）。
- amc-mm 登录页同步添加「忘记密码？」链接及弹窗。

## Changelog v1.8.38 — 2026-07-09 (同步账号恢复与草稿AI创作条件放宽)

### 品牌故事页同步账号按钮恢复
- **自媒体配置面板重构**：`BrandProfileView` 的“官方自媒体运营阵地 (Official Channels)”模块不再因未绑定账号而隐藏。当未绑定账号时，展示友好的占位提示，并始终提供“同步账号”按钮。
- **即时账号同步**：在品牌故事页中集成“同步账号”操作，直接 POST 调用 `/api/brands/[id]/sync-postfast` 接口，拉取最新的社交账号资产。

### 新建草稿 AI 创作条件放宽
- **零文本素材创作 (Zero-text Creative Generation)**：当“今日主题/素材说明”和“正文/Caption”全部为空时，只要用户关联/选择了至少一个“素材 (Media Asset)”，即被允许点击“✨ AI 创作”和“保存”按钮。
- **AI 智能意图构思**：后台 `marketingGraph` 和 Copywriter 智能体将读取已选素材的视觉特征 (AI 视觉打标/描述)、品牌主页上下文、品牌语气词典等线索，自动为该平台构思并撰写文案，降低用户的文字输入负担。
- **草稿保存校验放宽**：修改草稿的保存逻辑，在素材不为空时，允许 Caption 为空进行保存。

