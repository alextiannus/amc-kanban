# PRD: AMC-Content 创意直用视频生产链

> 状态：已批准并进入分阶段实施
> 适用系统：`amc-content`、`amc-kanban`、PostFast
> 主要用户：AMC 内部运营；所有内容人工审核后才能生成或发布

## 1. 产品边界

AMC 视频能力按任务解耦，不绑定任何单一厂商：

- `amc-content` 负责创意选择、不可变来源快照、可编辑逐镜脚本、标准提示词、资产版本链、Seedance 生成、TTS、异步任务、媒体回存、后期、创意质量审核和视频生产工作台。
- `amc-kanban` 负责工作台入口、身份签名、当前商家上下文、品牌素材记录和 OBS 上传；后续发布阶段再负责排期、社交平台授权与 PostFast 调用，不执行视频/TTS 供应商任务。
- 新项目只允许选择状态为 `ready`、类型为视频且时间轴非空的创意。已有参考视频分析型项目继续可查看和完成，但不再提供该模式的新建入口。
- 视频生成固定使用 Seedance 2.0 profile，兼容降级范围仅为 Seedance Standard、Fast、Mini；Seedance 不负责生成字幕或口播。
- AMC-Content 保存并解析视频、TTS和媒体处理供应商配置；AMC-Kanban 只保存社交平台/PostFast密钥，不接触内容生产供应商密钥。

端到端流程为：

```text
选择已拆解创意 -> 创意来源快照 -> 可编辑脚本/分镜/Prompt
              -> 图片与声音（图片生成视频） -> Seedance 片段/TTS -> 后期 -> 审核下载
              -> 拍摄批次/原片分析/分镜匹配（实拍混剪） -> 人工逐镜确认 -> 直接剪辑/视频生视频/图生视频 -> 后期 -> 审核下载
```

每一步必须产出可审核、可复用、可追溯的结构化资产，而不是只返回一条视频文件。

## 2. 动态任务模型路由

统一任务：

```text
reference_video_analysis
reference_audio_transcription
reference_subtitle_ocr
selling_point_extraction
script_generation
storyboard_generation
video_prompt_generation
video_generation
tts_generation
creative_quality_review
```

模型配置至少包含：`provider`、`modelName`、`baseUrl`、`secretRef`、`taskTags`、`capabilities`、`priority`、`isEnabled`、`timeoutMs`、`maxRetries`、`fallbackProfileIds`、`costMetadata`。

能力标签为：`text_input`、`image_input`、`video_input`、`audio_input`、`structured_json`、`video_output`、`audio_output`、`reference_video`、`reference_image`、`reference_audio`。

路由顺序：

1. 项目显式指定的 profile；
2. 任务默认主 profile；
3. 主 profile 的能力匹配 fallback；
4. 同任务下按优先级选择的能力匹配 profile；
5. 全部失败则任务失败，绝不伪造成功结果。

配置变更只影响新任务。历史资产继续绑定原 profile、真实模型名、提示词版本和 fallback 路径。

## 3. 创意应用与逐镜编辑

新建项目接收 `creativeId`，并保存创意版本、extraction 版本、analysis 版本以及不可变 `CreativeSourceSnapshot`。创意时间轴必须确定性原样导入，不调用模型改写：`onScreenText` 映射字幕，`voiceover` 映射口播，画面、景别、运镜、动作、声音和叙事作用共同映射分镜及 Seedance Prompt。

所有创意来源类型均允许应用；竞品或“仅竞品分析”来源必须在页面警告并记录操作者，但不会作为生成阻断条件。爆品/竞品源视频只用于学习脚本结构，永远不得作为成片素材或发送给视频生成模型。生成输入只允许来自当前品牌且由用户明确加入项目并人工确认的图片或摄影原片。

字幕、口播、画面 Prompt 和时长均可逐镜编辑。每次编辑创建该镜新版本并保留旧脚本、音频、视频；不同输入的失效范围为：

- 字幕变化：只使最终成片失效；
- 口播文字、音色或语音参数变化：只使该镜 TTS 与最终成片失效；
- Prompt、图片顺序或镜头时长变化：使该镜 Seedance 视频与最终成片失效；镜头时长变化同时使现有 TTS 需要重新校验。

### 3.1 图片素材与摄影原片

`image_only` 项目每镜必须绑定 1–4 张有序品牌图片，第一张为主参考图。`hybrid_footage` 项目创建拍摄批次，默认命名 `YYYY-MM-DD · 项目标题`，同品牌同名自动追加 `· 02`、`· 03`；名称可改但必须为 1–80 字。新上传原片统一进入 Kanban 系统目录“视频原片”，OBS 键为 `brands/{brandId}/assets/视频原片/{year}/{date}/{projectId}/{uniqueFilename}`，保留 `originalFilename`。已有品牌视频必须人工加入当前项目后才参与匹配；Content 只保存品牌素材 ID、关联、分析和派生片段。

原片后台任务在页面关闭后继续。系统以 FFprobe 校验真实时长、编码和分辨率，以 FFmpeg 场景检测结合多模态分析时间线切分；派生片段只存 Content 项目存储。匹配权重固定为语义 40%、景别/运镜 20%、时长/节奏 15%、画质/方向 15%、连续性 10%，`>=0.75` 为强匹配、`0.55–0.75` 为相似候选、`<0.55` 不推荐，每镜最多显示 3 个候选和理由。相似候选不得自动采用；无候选时输出包含主体、动作、场景、景别、机位、运镜、时长、方向比例和验收要求的补拍清单。

每镜人工确认 `fulfillmentMode=direct_clip|reference_to_video|image_to_video|unresolved`。直接实拍保存 `selectedSourceClipId` 并执行确定性裁切；视频生视频把片段真实作为 `reference_video`；图生视频仍使用 1–4 张品牌图片；`unresolved` 可保存但阻止最终合成。修改脚本、时长、素材或生产方式，只使受影响的匹配、生成结果和最终成片失效。

### 3.2 声音

项目提供默认音色，分镜可继承或覆盖；设置包括 `enabled`、`voiceId`、`speed`、`volume`、`pitch`。音色目录来自 MiniMax 系统、克隆和设计音色查询，短时缓存并在失败时回退最近成功缓存。试听仅在用户点击时调用并按音色、文字和参数缓存。本期不提供声音克隆、声音设计或真人样本上传。

TTS 为可选能力。正式逐镜音频保存为 `generated_media(role=tts)` 和版本化 `VoiceoverTrack`。音频短于镜头时补静音；长于镜头时阻止合成并提示缩短文案、加快语速或延长后重新生成镜头，不静默截断。

### 3.3 旧参考视频分析兼容

#### 3.3.1 输入与权利

输入包括参考视频、商家事实、品牌物料和已授权素材。参考资产必须记录：来源、权利状态、允许用途（`analysis`、`generation_reference`、`publish_derivative`）、确认人和有效期。

竞品视频只有经 `ADMIN` 或 `AMC_PRINCIPAL` 确认 `generation_reference` 后，才允许发送给视频生成供应商。

#### 3.3.2 两级分析路径

- 原生路径：支持 `video_input + structured_json` 的多模态模型直接分析视频，输出带时间码证据的拆解卡。
- 预处理路径：FFmpeg 镜头检测和关键帧、ASR 口播转录、OCR 字幕识别，再交给支持 `image_input + structured_json` 的模型综合分析。

主模型失败时只能降级到满足当前路径所需能力的模型，不得退化为纯文本猜测。所有能力匹配模型都失败时，任务进入 `failed` 并等待人工重试。

拆解卡固定包含定位、人群、主题、时长节奏、镜头统计、前三秒 Hook、AIDA、VO/字幕风格、景别与运镜、3–5 个关键镜头、场景人物道具、产品露出、音乐环境音音效、CTA、可迁移结构、不可迁移事实、禁止复制元素，以及强记忆/新奇性/创新性评分。每项结论必须关联时间码、字幕原文、口播原文或关键帧证据。

## 4. 版本化结构资产

每个项目依次保存：

```text
CreativeSourceSnapshot -> ScriptPackage -> Storyboard -> PromptBundle
-> MaterialSelection -> VideoGenerationJob -> GeneratedClip/VoiceoverTrack
-> FinalVideo -> PublishPackage -> PerformanceSnapshot
```

公共元数据包括 schemaVersion、businessVersion、parentAssetIds、inputHash、模型与提示词 provenance、状态、审核记录、成本、操作者、时间和错误。上游事实或资产改变后，下游未发布版本标记为 `stale`；历史版本不删除。

`ScriptPackage` 并行保存 VO、画面字幕以及小红书、Instagram、Facebook、Google Business、TikTok 五个平台发布文案。

`Storyboard` 每行保存时长、景别、机位、运镜、动作、场景、道具、AIDA 目的、字幕、VO、音效/音乐、所需素材、连续性要求、参考资产和允许参考的元素。素材检查为 `satisfied | missing | manual_review`；缺少必要素材时可保存方案，但不能提交生成。

`PromptBundle` 使用标准三层结构：

- `globalPrompt`：全片风格、品牌、人群、平台与比例；
- `continuityPrompt`：角色、产品、门店、Logo 与色彩一致性；
- `shotPrompts[]`：逐镜头动作、时间推进、运镜和负面提示词。

供应商 Adapter 把标准 PromptBundle 转换为请求。通用任务类型为：

```text
VideoGenerationJob
- providerProfileId
- projectId
- variantId
- sceneId
- mode
- promptBundleVersionId
- referenceAssetIds
- outputSpec
- idempotencyKey
```

旧 `seedanceJobs` 仅作为兼容输出，由适配层转换为通用任务。

## 5. 生成、后期、审核和发布

新项目一次只生成一个分镜、一个版本，不再默认创建三套全片任务。Prompt、图片顺序、视频片段、履约方式或时长变化后使用新的幂等键并使旧费用确认失效；重复点击保持幂等，只有明确点击“重新生成”才创建新版本。`reference_to_video` 仅可路由到同时具备 `video_output + reference_video` 的能力配置；能力不可用时只禁用视频生视频，直接剪辑和图生视频继续可用。

视频供应商只生成无文字镜头片段。用户为每镜选择一个成功版本后，AMC-Content 按分镜顺序拼接，将逐镜 TTS 按时间轴混合为口播轨、自动降低背景音乐音量，并根据最终镜头时长重新计算字幕时间码后由 FFmpeg 叠加。输出固定生成 9:16、4:5、1:1 三种成片。

发布前检查关键帧感知哈希、视觉向量、音频指纹、VO/字幕 5-gram、人脸、Logo、商标和业务事实。近重复、参考原音频、文本重合超过 22% 或未授权商标命中时阻断发布。

审核至少覆盖品牌一致性、业务事实、平台合规和权利。当前工作台首版不自动批准、不自动抓取竞品视频、不创建 Kanban 草稿、不发布，也不回流互动指标；只允许下载人工批准且未被相似度/授权检查阻断的成片。发布、A/B 和 72/168 小时互动回流属于后续阶段。

## 6. API 与界面

AMC-Content：

- `POST /v1/video/create`：接收项目、分析、分镜、提示词和可选模型配置；默认 `plan_only`，`submit` 只接受审核通过且素材齐全的资产。
- `POST /v1/lab/reference-video-analyses`：创建或重跑分析。
- `GET /v1/lab/model-tasks`：查看能力要求、主模型和 fallback 链。
- `PATCH /v1/lab/model-tasks/:task`：仅 `ADMIN` 调整路由。
- `GET /v1/video/jobs/:id`：查询供应商任务、fallback、成本和成片状态。
- `POST /v1/video/jobs/:id/assemble`：在 Content 内完成字幕、配音、音乐、Logo和多比例派生。
- `POST /v1/tts/generate`：按 Content 的 `tts_generation` 路由生成口播。
- `/v1/lab/video-projects*`：项目列表、创建、阶段摘要、拆解、反馈重跑、审核、估价确认、生成、单镜头重试、合成和审核后下载。
- `PATCH /v1/lab/video-projects/:id/shots/:shotId`：编辑单镜 Prompt、时长、字幕、口播和声音覆盖设置。
- `PUT /v1/lab/video-projects/:id/shots/:shotId/materials`：保存 1–4 张有序品牌图片；第一张标记为主参考图。
- `POST /v1/lab/video-projects/:id/shots/:shotId/estimate|generate` 与 `PUT .../selected-clip`：逐镜估价、幂等生成和版本选择。
- `GET /v1/lab/tts/voices` 与 `POST|DELETE .../voiceover`：音色目录、试听、正式 TTS 和移除逐镜音轨。
- `GET|POST /v1/lab/video-projects/:id/materials*`：通过 Kanban 内部桥接完成品牌图片列表、搜索、预签名上传和确认。
- `GET|POST /v1/lab/video-projects/:id/source-videos*`：列出、上传、从“视频原片”关联、分析和失败重试。
- `POST /v1/lab/video-projects/:id/match-shots` 与 `GET .../shot-matches`：生成并读取限定当前项目素材集的候选与补拍清单。
- `PUT /v1/lab/video-projects/:id/shots/:shotId/fulfillment`：保存逐镜生产方式、片段/图片选择和人工确认审计字段。

AMC-Content 的“视频生产”工作台有两个入口。`image_only` 保持“选择创意、脚本与分镜、图片与声音、视频生成、合成下载”五步不变；`hybrid_footage` 使用“选择创意、脚本与分镜、实拍素材与匹配、声音设置、视频生成、合成下载”六步。实拍步骤展示批次、后台分析状态、至多 3 个候选、评分理由、制作方案草稿、人工逐镜确认和补拍清单。Content Lab 的“模型与路由”对 `ADMIN` 可编辑、对 `AMC_PRINCIPAL` 只读；API Key 仍只存在 AMC-Content 的服务端配置。

Kanban 左侧“视频生产”仅向 `ADMIN`、`AMC_PRINCIPAL`展示，通过短期签名跳转并传递已授权的当前商家；Kanban 不保存或执行视频/TTS 配置。

## 7. 验收

- Seedance profile 只参与 `video_generation`，不会被选为参考视频分析模型。
- Gemini、GLM 或其他能力匹配的多模态模型可配置为 `reference_video_analysis`。
- 仅图片模型通过关键帧 + ASR + OCR 路径分析；不能进行纯文本猜测。
- 配置切换不修改历史资产，新运行产生新版本。
- 同一 PromptBundle 可交给不同视频供应商并返回统一状态。
- 未确认权利、事实、必要素材或审核时不能提交生成。
- 三个变体除 Hook 外保持实验变量一致。
- 流心蛋黄酥案例可从参考拆解追溯到最终发布和互动快照。
- 旧内容生成、旧 `/v1/video/create` 和已有 Seedance 调用保持兼容。

## 8. 实施顺序

1. 动态模型路由、视频分析、结构资产、文案、分镜、提示词与审核。
2. 通用视频 Adapter、三变体、TTS、字幕、音乐、FFmpeg 后期与相似度检查。
3. Kanban 审批发布、A/B、互动回流、成本与质量看板。

任何依赖真实供应商账号、生产媒体或平台发布权限的验收，在代码与模拟集成测试通过后仍须进行生产前联调。
