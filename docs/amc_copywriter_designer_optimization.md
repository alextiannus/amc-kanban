# AMC Copywriter & Designer 深度优化方案 (参考 Postiz-app)

通过深度审计 Postiz-app 的 `AgentGraphService`（LangGraph 编排层）、`OpenaiService` 以及各项底层支持类库，我们整理出了一套从**提示词工程 (Prompt Engineering) 到后端技术底座**的高价值优化方案。

结合 AMC 的餐饮出海定位与到店 ROI 转化诉求，我们建议在 **AMC Copywriter** 和 **AMC Designer** 模块中整合以下能力：

---

## 1. AMC Copywriter (文案智能体) 强化方案

### A. 双阶段生成架构：爆款 Hook 与正文解耦 (Two-Stage Hook & Content Generation)
*   **Postiz 做法**：先执行 `generate-hook`，生成 1-2 句吸引眼球 of Hook；随后执行 `generate-content`，将 Hook 作为 context 传入，生成主体。
*   **AMC 优化**：针对出海中餐老板在**小红书（封面标题至上）**和 **Instagram（前两行折叠限制）**的发布痛点，重构 Copywriter 节点为：
    1.  **Hook 阶段**：专门输出“标题/首句吸引线”。设定严格规则（如：禁止使用 "Discover the secrets...", "The best...", "The most...", "The top..." 等俗套格式；小红书端强制包含爆款痛点表情与“叹号叹号”句式）。
    2.  **正文阶段**：读取 Hook 成果，限制字符数（如 Twitter 限制 200 字符，小红书限制带排版），并在句末强力植入 **CTA (Call to Action) 预订链接或专属折扣码**。

### B. 爆款历史模板库相似度匹配 (Few-Shot Popular Posts Retrieval)
*   **Postiz 做法**：通过 `find-popular-posts` 查找当前类别下点赞率高的历史推文，并把它们的 Hook 作为 Prompt 的 `existing hooks` 输入。
*   **AMC 优化**：
    *   在 `src/agents/knowledgeBase.ts` 中整合向量检索，查询与当前餐品（如“麻辣香锅”、“小笼包”）风格类似、且在本地商圈中**引流核销率最高**的历史发帖。
    *   将这些真实案例作为 Few-Shot 示例喂给 Copywriter，让其学习如何自然地把菜品描述转化为“限时折扣/优惠券核销”引导。

### C. 品牌人称与语气控制 (Tone & Perspective Switches)
*   **Postiz 做法**：提供 `tone`（Personal vs Company）开关，直接强制使用“第一人称（I）”或“第三人称（We）”文案模式。
*   **AMC 优化**：餐饮品牌运营需要更细腻的语气切换。我们可在 `brandcontext.md` 中预设三种语气模式，并在 Copywriter 中实现对应的人称Prompt模板：
    *   `老板/主厨视角` (1st Person - "我今天亲自挑选了新鲜的螃蟹...")
    *   `探店推荐视角` (3rd Person - "这家在新加坡克拉码头的川菜馆绝了...")
    *   `官方通告视角` (We/Company - "我们很高兴为您呈献全新的夏季菜单...")

### D. 多渠道自适应分发拷贝 (Multi-Channel Copy Variant Generation)
*   **AMC 优化**：Copywriter 自动生成 **JSON 多平台变体包**，各平台采用最符合其受众直觉的排版与字符限制：
    -   **小红书拷贝**：高频使用 Emoji，Markdown 分点，以“#Tag”结尾。
    -   **Instagram 拷贝**：英文/双语，风格高级，植入餐厅 `@handle` 与 Bio 链接。
    -   **Google Business Profile 拷贝**：语气客观专业，突出营业时间、地址及特惠兑换说明。

### E. 闭环自我纠错与重试 (Self-Refinement & Compliance Loop)
*   **AMC 优化**：将 `complianceCheckNode` 与 `Copywriter` 建立底层的 **LLM 自我纠错闭环**：
    -   当合规审计节点发现敏感词或格式不合规时，自动将“失败原因”和“原草稿”打包回退至 Copywriter 重新生成。
    -   限制最大自检重试次数为 2 次。只有在 AI 无法自行纠错的情况下，才触发 HIL Interrupt 拦截，极大降低对用户的通知打扰。

---

## 2. AMC Designer (设计师智能体) 强化方案

### A. 智能图像 Prompt 协同生成与自动扩充 (Prompt Expansion)
*   **Postiz 做法**：在文案生成时，让 LLM 输出一个结构化的 `prompt`（要求：非常详细、描述风格、绝对不包含品牌名称）。
*   **AMC 优化**：Copywriter 自动根据文案主题生成一段专为 **Imagen 3 / Midjourney** 调优的食物摄影提示词，并由 Designer 自动扩充光影、材质、相机镜头描述（如：*“Steaming dumplings, warm lighting, macro shot, shallow depth of field”*），生成高质量底图。

### B. "AI 素材合成" 与物理水印排版闭环 (Programmatic Layout Rendering)
*   **AMC 优化**：生成的 AI 配图不能直接发布，AMC Designer 必须将其转为营销海报：
    1.  Designer 接收 AI 自动生成的背景配图，或商家上传 of 生图。
    2.  利用 Node.js 的 `sharp` 库，自动将**商家的 Logo**（通过 brandContext 读取）和 **AI Copywriter 生成的特惠水印标签**（如 “50% OFF”, “端午特惠”）进行物理叠加。
    3.  最终渲染出带有明确品牌识别度的“专业营销海报”，解决纯 AI 生图无法落地的痛点。

### C. 真实素材智能配对与风格化裁剪 (Real-Asset Pairing & Adaption)
*   **AMC 优化**：优先使用素材库中商家实拍的真实菜品生图。根据分发渠道的比例（小红书 3:4 竖屏，Google Business 4:3 横屏）进行**智能裁剪和亮度和对比度调优**，既保持菜品的真实性，又达到专业排版的美观度。

### D. 批次主题营销系列视觉一致性 (Batch Campaign Visual Consistency)
*   **AMC 优化**：同一活动（如端午系列）下的多张图片，自动锁定统一的视觉滤镜、边框模板及字体排版，形成视觉锤。

---

## 3. Postiz-app 的高级技术支撑特性

这些特性对于 AMC 的 “到店 ROI 转化挂钩” 和 “TikTok 短视频引流” 有极高参考价值：

*   **智能短链与引流追踪 (Short-Linking Service)**：原生集成 **Dub.co** 和 **Short.io**。发布前自动检测长网址（预订链接、特惠核销页），一键转换成带商家域名的短链。通过短链 API 获取实时点击、地理分布及渠道来源，**直接支持 AMC 的到店 ROI 效果统计**。
*   **AI 视频生成集成 (Veo3 Image-to-Video)**：接入 Kie.ai 接口，输入提示词并配合 1-3 张静态生图，自动异步轮询生成垂直 (9:16) 竖屏短视频，用于 **TikTok 和 Instagram Reels 的全自动视频分发**。
*   **Temporal 分布式任务调度**：利用 Temporal.io 对发布队列进行事务级管理，提供指数退避重试，保障跨国多渠道发布成功率。

---

## 4. Postiz-app 提示词工程 (Prompt Engineering) 解析

Postiz-app 在 LLM 提示词编写上，体现了极强的**规范化**与**防呆设计（Defensive Prompting）**：

### A. 强类型结构化输出 (Structured Outputs & Zod Formats)
*   **做法**：不依靠 LLM 自然语言输出后再用 Regex 提取。Postiz 全程使用 OpenAI 的 `openai.chat.completions.parse` 配合 **Zod 模式绑定**（如 `zodResponseFormat(PicturePrompt, 'picturePrompt')`）。
*   **示例**：Zod 强制约束输出格式必须为：
    ```typescript
    const content = z.object({
      content: z.string().describe('Content for the new post'),
      website: z.string().optional().describe('Website URL containing brand name'),
      prompt: z.string().describe('Image generation prompt without brand names')
    });
    ```
*   **价值**：保证模型输出 100% 程序可读，杜绝 JSON 结构损坏导致的系统崩溃。

### B. 负向提示词硬性控制 (Negative Prompting)
*   **做法**：在 Prompt 中明确定义禁止生成的句式，限制 LLM 生成“AI感”过重的内容。
*   **示例**（源自其 `generateHook` 源码）：
    > `Avoid weird hook that starts with "Discover the secret...", "The best...", "The most...", "The top..."`
    > `Don't be cringy. Use simple English.`

### C. 输入数据物理隔离 (Context Isolation)
*   **做法**：在拼接上下文时，Postiz 使用 HTML 注释标签强行隔离输入源，防止 LLM 发生 Prompt 注入攻击或产生幻觉。
*   **示例**：
    ```xml
    <!-- BEGIN request of the user -->
    {request}
    <!-- END request of the user -->
    
    <!-- BEGIN existing hooks -->
    {hooks}
    <!-- END existing hooks -->
    ```

### D. 图像提示词自动扩充 (Prompt Expansion)
*   **做法**：系统内置了一个专门的“扩词器” System Prompt，将简短的食物描述自动转化为具有相机参数、光影质感的长提示词。
*   **示例**（源自其 `generatePromptForPicture` 源码）：
    > `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it's realistic describe the camera.`

### E. 智能拟人化语音剧本生成 (Natural Speech Synthesis Prompting)
*   **做法**：在生成配套视频音轨时，指示 LLM 生成带有人类呼吸和停顿的文本，直接提升 TTS（语音合成）的自然度。
*   **示例**（源自其 `generateVoiceFromText` 源码）：
    > `...when a person talk they don't use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person.`

---

## 5. 多大模型后台热插拔配置与按需调用设计 (Multi-LLM Configuration & Routing)

为满足 AMC 平台的灵活性、成本控制以及对不同厂商优势模型的整合，我们在系统底座引入“多大模型统一路由与配置引擎”。

### A. 数据库架构设计 (Prisma Schema - LLM Config)
在后台数据库中，设计 `LLMConfig` 模型存储管理员注册的各种大模型服务，并包含 `isDefault` 字段用于兜底：

```prisma
model LLMConfig {
  id           String   @id @default(uuid())
  provider     String   // "openai" | "anthropic" | "google" | "deepseek" | "custom_shim"
  displayName  String   // 页面显示名称，如 "GPT-4o", "Claude 3.5 Sonnet", "DeepSeek-V3"
  modelName    String   // 实际调用模型代号，如 "gpt-4o-2024-05-13", "claude-3-5-sonnet-20240620"
  apiKey       String   // 加密存储的 API Key
  baseUrl      String?  // 针对内网代理或第三方中转的 custom endpoint
  isEnabled    Boolean  @default(true)
  isDefault    Boolean  @default(false) // 标记为通用默认模型，用于未匹配到任务标签时的全局兜底
  taskTags     String[] // 适用任务能力标签，如 ["copywriting", "reasoning", "translation", "quick_formatting"]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### B. 动态路由工厂 (Dynamic Model Routing Factory)
在 LangGraph 执行前，通过模型工厂读取激活配置，支持**任务专用模型 $\rightarrow$ 数据库默认模型 $\rightarrow$ 环境变量兜底模型**的三级降级回退机制：

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-gai";

export async function getModelForTask(taskTag: string) {
  // 1. 优先查询针对该任务类型启用且优先级最高的配置
  let config = await prisma.lLMConfig.findFirst({
    where: {
      isEnabled: true,
      taskTags: { has: taskTag }
    },
    orderBy: { createdAt: 'asc' }
  });

  // 2. 若未匹配到任务专属模型，则寻找数据库中的全局默认模型 (isDefault = true)
  if (!config) {
    config = await prisma.lLMConfig.findFirst({
      where: {
        isEnabled: true,
        isDefault: true
      }
    });
  }

  // 3. 若数据库中无任何配置，回退到系统环境变量 (Environment Variables) 预设的底层默认模型
  if (!config) {
    console.warn(`No active LLMConfig found in database. Falling back to system default environment model.`);
    return new ChatOpenAI({
      modelName: process.env.SYSTEM_DEFAULT_LLM_MODEL || "gpt-4o-mini",
      openAIApiKey: process.env.SYSTEM_DEFAULT_LLM_API_KEY
    });
  }

  // 4. 根据 provider 初始化对应的 LangChain 客户端
  switch (config.provider) {
    case "openai":
      return new ChatOpenAI({
        openAIApiKey: decrypt(config.apiKey),
        modelName: config.modelName,
        configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined
      });
    case "anthropic":
      return new ChatAnthropic({
        apiKey: decrypt(config.apiKey),
        modelName: config.modelName,
        anthropicApiKey: decrypt(config.apiKey),
      });
    case "google":
      return new ChatGoogleGenerativeAI({
        apiKey: decrypt(config.apiKey),
        modelName: config.modelName,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
```

### C. 任务路由分配方案 (Routing Policy)

| 智能体节点 (LangGraph Node) | 路由任务标签 (Task Tag) | 首选大模型方案 | 备选大模型方案 | 路由考量 |
| :--- | :--- | :--- | :--- | :--- |
| **Researcher (研究员)** | `quick_formatting` | **Gemini 1.5 Flash** | GPT-4o-mini | 分类、打标和搜索，要求**低延迟与低成本**，充分利用 Gemini 庞大的上下文能力。 |
| **Strategist (策略师)** | `reasoning` | **Claude 3.5 Sonnet** | GPT-4o | 涉及多品牌竞品交叉比对、节日提案计算，要求**高逻辑推理和长上下文连贯性**。 |
| **Copywriter (文案师)** | `copywriting` | **DeepSeek-V3 / GPT-4o** | Claude 3.5 Sonnet | 生成爆款 Hook 与正文。要求**文笔灵动、符合餐饮本地化语气**，对中文及 Singlish 适配性强。 |
| **Compliance (合规自检)** | `compliance` | **GPT-4o** | Claude 3.5 Sonnet | 按照多平台严格规则自检过滤敏感词，要求**模式匹配度极高，符合结构化 Zod 输出约束**。 |
