# AI Marketing Crew (餐饮零售自媒体运营看板) PRD 核心理念

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
    *   **任务卡片化：** 所有的运营动作变成一张张清晰的 Task Card（如：“周五晚市促销文案撰写”、“回应 3 条 Google Maps 差评”），老板只需做选择题，而不是填空题。
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
*   **业务逻辑**：根据当前登录账户，加载该用户作为直接拥有者（`ownerId`）、联合拥有者（`BrandOwner` 表中关联）或者具备管理权限的所有品牌，确保老板登录后能够一屏掌控名下所有的餐饮品牌。

---

## 系统配置架构决策 (System Config Architecture)

### 核心原则：所有 AI 模型与第三方服务的 API Key 必须存储在数据库 SystemConfig，不写入 Render 环境变量

**背景**：早期实现中，Gemini API Key 等凭证被放入 Render 服务的 Environment 变量中。但这种方式有以下问题：
- 凭证更新需要重新部署（延迟高）
- 多服务实例之间无法共享配置
- 无审计追踪（无法知道谁在什么时间修改了哪个 Key）
- 开发人员/AI Agent 容易误以为需要修改 Render 配置，产生职责混乱

**架构决策（2026-06-27 确认）**：

| 配置项 | 存储位置 | 访问方式 | 禁止位置 |
|--------|----------|----------|----------|
| Gemini API Key | `SystemConfig.geminiApiKey`（DB） | `getGeminiApiKey()` | ❌ Render env |
| Azure Speech Key | `SystemConfig.azureSpeechKey`（DB） | `getAzureSpeechConfig()` | ❌ Render env |
| Azure Speech Region | `SystemConfig.azureSpeechRegion`（DB） | `getAzureSpeechConfig()` | ❌ Render env |
| 未来新增 LLM/模型 Key | `SystemConfig.*ApiKey`（DB） | 对应 `get*Config()` 函数 | ❌ Render env |

**唯一例外**：`DATABASE_URL`、`JWT_SECRET`、`NEXTAUTH_SECRET` 等基础设施级别的机密，仍放在 Render 环境变量中（这些无法从数据库读取，因为数据库连接本身需要它们）。

### SystemConfig 数据模型

```prisma
model SystemConfig {
  id                 String   @id @default("default")
  geminiApiKey       String?  // Google Gemini API Key
  azureSpeechKey     String?  // Microsoft Azure Speech TTS Key
  azureSpeechRegion  String?  // Azure Region: eastasia / southeastasia / eastus
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

### 管理入口
- **后台路径**：`/admin` → 全局 AI 接口配置面板
- **API**：`PATCH /api/admin/system-config`（Admin only，带 AuditLog）
- **读取函数**（`src/lib/systemConfig.ts`）：
  - `getGeminiApiKey()` — 返回 Gemini Key 或 null
  - `getAzureSpeechConfig()` — 返回 `{ key, region }` 或 null

### Azure Speech TTS 配置说明
- **服务**：Microsoft Azure Cognitive Speech
- **推荐 Voice**：`zh-CN-XiaoxiaoNeural`（高质量中文女声）
- **免费层**：F0 定价，每月 5 小时 Neural TTS 免费
- **申请地址**：[portal.azure.com](https://portal.azure.com) → 搜索 "Speech service" → Create
- **推荐区域**：`eastasia`（香港，延迟最低）或 `southeastasia`（新加坡）
- **Key 类型**：复制 KEY 1（`Ocp-Apim-Subscription-Key`）
- **降级策略**：若 Azure Key 未配置，amc-mm 自动使用浏览器内置 `window.speechSynthesis`（已做智能声音选择优化）

---

## 📋 Changelog

### v1.1.0 — 2026-06-28

#### 功能变更：移除 AI 泳道池 + 工作日志状态过滤

**决策背景**：运营看板 Dashboard 首页的"AI 活动战报 — 品牌泳道工作看板"（BrandKanbanLane）区域在实际使用中被认为冗余，且信息与工作日志重叠。同时工作日志缺乏按任务状态筛查的能力。

**变更内容**：
1. **移除 AI 泳道池**：从 `DashboardHome.tsx` 移除"AI 活动战报"section，删除 `BrandKanbanLane` 组件引用。`BrandKanbanLane.tsx` 文件保留（不删除组件文件），以供未来扩展使用。

2. **工作日志记录全操作**：`/api/logs/agent` 路由移除 `actorType: 'AI_AGENT'` 的限制，改为记录所有类型操作者（人工 + AI）的 AuditLog，实现真正意义上的"全工作日志"。

3. **工作日志状态多选 Filter**：在 `AgentLogsView.tsx` 过滤栏顶部新增泳道状态多选胶囊组（todo / in_progress / pending / done / void），支持多选。
   - 未选中任何状态 = 显示全部日志
   - 选中状态 = 仅显示 `STATUS_CHANGED` 类型日志中 `newValue.status` 匹配的记录（其他类型日志如 TASK_CREATED、DRAFT_CREATED 始终显示）
   - "重置筛选"按钮同步清空状态选择

**冲突检查**：无冲突。本次变更不影响 PRD 核心功能（内容创作、发布日历、素材管理）。

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
