# PRD: AMC-Content 参考视频驱动生产链

> 状态：已批准并进入分阶段实施
> 适用系统：`amc-content`、`amc-kanban`、PostFast
> 主要用户：AMC 内部运营；所有内容人工审核后才能生成或发布

## 1. 产品边界

AMC 视频能力按任务解耦，不绑定任何单一厂商：

- `amc-content` 负责参考视频理解、卖点、文案、分镜、标准提示词、资产版本链和创意质量审核。
- `amc-kanban` 负责视频生成、TTS、异步任务、媒体回存、后期、审核发布和互动指标同步。
- Seedance、Volcengine、Kie.ai、FAL 只是可注册到 `video_generation` 的供应商；Seedance 不是分析模型，也不是通用业务类型。
- AMC-Content 保存并解析视频、TTS和媒体处理供应商配置；AMC-Kanban 只保存社交平台/PostFast密钥，不接触内容生产供应商密钥。

端到端流程为：

```text
输入 -> 参考视频分析 -> 卖点 -> 文案 -> 分镜 -> 提示词
     -> 视频片段生成 -> 后期 -> 审核发布 -> 72h/168h 互动回流
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

## 3. 参考视频分析

### 3.1 输入与权利

输入包括参考视频、商家事实、品牌物料和已授权素材。参考资产必须记录：来源、权利状态、允许用途（`analysis`、`generation_reference`、`publish_derivative`）、确认人和有效期。

竞品视频只有经 `ADMIN` 或 `AMC_PRINCIPAL` 确认 `generation_reference` 后，才允许发送给视频生成供应商。

### 3.2 两级分析路径

- 原生路径：支持 `video_input + structured_json` 的多模态模型直接分析视频，输出带时间码证据的拆解卡。
- 预处理路径：FFmpeg 镜头检测和关键帧、ASR 口播转录、OCR 字幕识别，再交给支持 `image_input + structured_json` 的模型综合分析。

主模型失败时只能降级到满足当前路径所需能力的模型，不得退化为纯文本猜测。所有能力匹配模型都失败时，任务进入 `failed` 并等待人工重试。

拆解卡固定包含定位、人群、主题、时长节奏、镜头统计、前三秒 Hook、AIDA、VO/字幕风格、景别与运镜、3–5 个关键镜头、场景人物道具、产品露出、音乐环境音音效、CTA、可迁移结构、不可迁移事实、禁止复制元素，以及强记忆/新奇性/创新性评分。每项结论必须关联时间码、字幕原文、口播原文或关键帧证据。

## 4. 版本化结构资产

每个项目依次保存：

```text
ReferenceVideoAnalysis -> SellingPointPackage -> ScriptPackage
-> Storyboard -> PromptBundle -> VideoGenerationJob -> GeneratedClip
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

脚本与分镜审核后默认生成三版。第一轮只改变 Hook 与前三秒，USP、主体镜头、活动信息、CTA 和长度保持一致；运营选两版进行 A/B，第三版为候补。单镜头失败可以换兼容模型重试，不重复生成成功镜头。

视频供应商只生成镜头片段。AMC-Content 独立执行品牌音色或授权 TTS、品牌字幕、授权音乐/环境音/音效、Logo/地址/预约或团购信息、片尾 CTA、媒体拼接/混音/响度归一。主输出为 9:16，并派生 4:5 与 1:1；自动裁剪伤害主体时才生成平台专用镜头。

发布前检查关键帧感知哈希、视觉向量、音频指纹、VO/字幕 5-gram、人脸、Logo、商标和业务事实。近重复、参考原音频、文本重合超过 22% 或未授权商标命中时阻断发布。

审核至少覆盖品牌一致性、业务事实、平台合规和权利。首版不自动批准、不自动抓取竞品视频。审核通过后由 Kanban/PostFast 发布；AMC-Content 不保存平台密钥。

72 小时和 168 小时回传播放、曝光、完播、点赞、评论、收藏、分享及发布异常。首版只称为互动表现，不称订单或营收转化。

实现接口 `POST /api/internal/video-performance` 只接受上述互动字段和 `windowHours=72|168`，按项目、变体、平台和平台帖子去重，并同步为 AMC-Content 的 `PerformanceSnapshot` 版本资产。

## 6. API 与界面

AMC-Content：

- `POST /v1/video/create`：接收项目、分析、分镜、提示词和可选模型配置；默认 `plan_only`，`submit` 只接受审核通过且素材齐全的资产。
- `POST /v1/lab/reference-video-analyses`：创建或重跑分析。
- `GET /v1/lab/model-tasks`：查看能力要求、主模型和 fallback 链。
- `PATCH /v1/lab/model-tasks/:task`：仅 `ADMIN` 调整路由。
- `GET /v1/video/jobs/:id`：查询供应商任务、fallback、成本和成片状态。
- `POST /v1/video/jobs/:id/assemble`：在 Content 内完成字幕、配音、音乐、Logo和多比例派生。
- `POST /v1/tts/generate`：按 Content 的 `tts_generation` 路由生成口播。
- `GET /api/admin/model-tasks`：Kanban 管理后台聚合两服务的任务归属、能力要求、主模型和 fallback 状态，不返回任何密钥。
- `POST /api/internal/video-performance`：保存并回流 72/168 小时互动快照。

Content Lab 展示拆解卡、产物版本链、每阶段实际模型/fallback、成本/耗时/失败统计，并允许为单项目选择新模型后创建新版本。

Kanban 通过 AMC-Content API 展示任务路由、执行状态和成本，不保存或执行视频/TTS配置。Kanban 的视频创建、状态和合成接口是鉴权代理；发布、排期和社交平台密钥继续归 Kanban。

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
