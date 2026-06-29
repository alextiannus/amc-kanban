# VideoDirector Self-Evolution PRD (Dify-first, No Scorecard)

## 1. 目标

把 VideoDirector 从“单次生成器”升级为“可持续自我学习的视频导演代理”。

本方案不使用固定评分卡，不靠人工定义的分数阈值驱动优化，而是依赖 AI 自主反思与经验累积：
- 每次任务都产出“可复用经验”。
- 每次失败都自动归因并更新策略。
- 每次成功都沉淀为可检索的最佳实践。

核心原则：
- Dify-first：学习逻辑、反思逻辑、策略演化逻辑放在 Dify。
- 业务层只负责输入输出与调用编排。

---

## 2. 自学习方法论

VideoDirector 的进化基于 4 个循环，不依赖显式评分卡：

1. Self-Reflection（自我反思）
- 每次生成后，AI 输出“哪里好/哪里不好/为何如此/下一次如何改”。

2. Memory Retrieval（记忆检索）
- 新任务开始前，从历史案例中检索“相似场景的成功策略与失败教训”。

3. Policy Distillation（策略蒸馏）
- 周期性把高质量案例总结成更稳定的 Prompt Policy 和导演策略模板。

4. Auto-Routing Evolution（自动路由进化）
- 根据场景自动选择更合适的生成策略与模型组合，并持续调整。

---

## 3. Dify 工作流设计（无评分卡版）

## 3.1 Task Intake

输入：
- brandId
- draftId
- imageAssetIds[]
- imageUrls[]
- userPrompt
- creativeHooks
- platform
- duration
- aspectRatio

输出：
- normalizedInput

## 3.2 Intent Structurer

把用户目标结构化为：
- objective
- audience
- scene
- emotion
- pacing
- brandAnchors
- negativeConstraints

## 3.3 Experience Retriever

从历史记忆中检索与当前任务最相似的经验：
- successPatterns[]
- failurePatterns[]
- reusablePrompts[]
- routingHints[]

检索来源：
- Dify Dataset（首选）
- 本地经验表（兜底）

## 3.4 Director Planner

生成导演计划：
- shotPlan
- cameraPlan
- motionPlan
- continuityRules

## 3.5 Prompt Composer

输入：intent + memory + plan
输出：
- finalPrompt
- modelParams
- rationale（为什么这么写）

## 3.6 Generation Router

基于任务上下文选择 provider/model：
- 创意优先路由
- 稳定性优先路由
- 成本优先路由

## 3.7 Video Generate

调用供应商并返回：
- taskId
- videoUrl
- providerTrace

## 3.8 Reflection Node（关键）

对本次结果做自由反思，不打分：
- whatWorked
- whatFailed
- rootCauses
- nextActionPlan
- mutationSuggestion（下次策略改写建议）

## 3.9 Repair-or-Accept

根据 Reflection 自主决策：
- accept：直接产出
- repair：触发一次策略修复再生成

最多 2 次 repair，避免无限循环。

## 3.10 Memory Writer

把本次经验写回长期记忆：
- caseSummary
- promptUsed
- reflection
- routeUsed
- finalOutcome

---

## 4. 数据结构建议（学习导向）

建议新增表：video_director_run
- id
- brandId
- draftId
- inputJson
- promptJson
- routeJson
- outputJson
- reflectionJson
- accepted(Boolean)
- attemptNo
- latencyMs
- costUsd
- createdAt

建议新增表：video_director_memory
- id
- brandId
- sceneKey
- patternType（success|failure|heuristic）
- content
- embedding
- sourceRunId
- createdAt

建议新增表：video_director_policy
- id
- policyVersion
- plannerTemplate
- composerTemplate
- routingTemplate
- mutationLog
- enabled
- createdAt

---

## 5. 自进化机制

## 5.1 在线学习（每次任务）

每次任务自动：
1. 检索历史经验。
2. 生成结果后做反思。
3. 把反思写入记忆。
4. 对下一次 prompt 策略做局部改写。

## 5.2 批量蒸馏（每天/每周）

离线任务：
1. 汇总最近 N 次 run 的 reflection。
2. 自动抽取高频有效策略。
3. 生成新 policyVersion。
4. 小流量灰度上线。

## 5.3 防漂移机制

为了避免“学坏”：
- 每个新策略只灰度到部分任务。
- 发生明显回退时自动回滚上一版本。
- 保留 stable policy 作为兜底。

---

## 6. 指标体系（非评分卡）

保留业务级可观测指标，但不定义质量打分卡：
- firstPassAcceptedRate
- avgAttemptCount
- manualOverrideRate
- timeoutRate
- costPerAcceptedOutput
- medianLatency

这些指标用于系统健康监控，不用于单条视频打分。

---

## 7. 与当前代码对接

你现在已有 VideoDirector API 路由，可按以下顺序接入：
1. 在生成前调用 Dify（Intent Structurer + Experience Retriever + Planner + Composer）。
2. 生成后调用 Dify Reflection Node。
3. Reflection 决定 accept 或 repair。
4. 将 run/reflection/memory 写入数据库与 Dify Dataset。

注意：所有 AI 服务密钥应配置在系统配置表，通过 Admin 页面维护，不使用部署环境变量作为业务密钥来源。

---

## 8. 30 天实施节奏

Week 1：打基础
- 接入 Experience Retriever
- 接入 Reflection Node
- 建立 run + memory 落库

Week 2：形成闭环
- 接入 repair 自动分支
- 上线 policyVersion 与回滚机制

Week 3：开始蒸馏
- 每日自动蒸馏经验
- 生成新策略版本并灰度

Week 4：稳定扩展
- 细分行业策略（餐饮/教育/零售）
- 提升跨品牌迁移能力

---

## 9. 验收标准

满足以下条件即通过：
- 任意一次任务都能追溯：输入 -> 策略 -> 反思 -> 记忆更新
- 新策略可灰度、可回滚
- 系统可在无人工逐条评分前提下持续提升 firstPassAcceptedRate
- 失败案例在下一批任务中出现明显减少
