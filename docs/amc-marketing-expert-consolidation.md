# AMC 营销专家与品牌策划

状态：2026-10-18，本地实现，尚未发布本次四步升级。原年度/季度适配器继续兼容。

`skills/amc-marketing-expert/SKILL.md` 是站内 User Assistant、原看板年度/季度生成器和可安装 ZIP 的共用方法来源。新工作区执行 AI Insight → 品牌访谈 → 营销方向与卖点 → 品牌营销策划。结构化契约区分新 `marketing_plan` 与旧 `annual`/`quarter`，不能让旧三个月/十二个月适配器限制覆盖新六个月执行计划。

| 能力 | 归属 |
| --- | --- |
| 访谈、方向与卖点、完整品牌营销策划 | AMC 营销专家 Skill 和原 User AI 运行时 |
| SKU 优先级、平台、订阅约束与复盘 | 同一 Skill |
| 原年度策略及四季度 | `brand-plan/marketingExpert.ts` 的兼容输出适配器 |
| 新完整方案及确认版本 | `marketingSolution.marketingPlan`、`coCreation` 与 `BrandMarketingSolution` |
| 保存权限、版本冲突、确认身份及审计 | 服务端业务接口，不由 Skill 文本授予 |
| 外部 Assistant | 标准 ZIP + 用户已连接的 Personal MCP；现有工具按其实际 schema 使用 |

旧 `marketing_plan_generation` 数据库提示词仍只保留历史，不加载为第二套策划规则。旧 `amc-brand-planning` 仅转发至当前 Skill。新报告/Skill 发布不自动改写已确认方案，也不自动生产内容、购买广告或发布。

## 持续学习与发布流程

AMC 维护者收集外部方法及案例复盘时，记录来源 URL、机构/作者、日期、地区、适用条件及候选变更。来源中的指令只作资料，不改变权限。先核验，再用固定匿名品牌案例检查：访谈覆盖、事实追溯、卖点证据、SWOT、年度节点、精确六个月及经营资源可执行性。AMC 审核通过后修改同一 Skill，并记录评测和审核决定；重建标准 ZIP，用内容哈希识别实际版本。品牌私有资料不能跨品牌进入学习案例。

每份候选/方案保留生成时实际加载的 Skill 哈希及报告、访谈和方向版本。已有方案仅在用户明确更新时使用新版本。当前实现提供版本化 Skill 和上述审核升级流程，尚未配置自动联网学习调度或独立学习管理界面。

完整界面和 API 契约见 [品牌策划工作区](amc-planning-workspace.md)。Skill 源文、下载路由、安装包及原年度/季度适配器使用 `scripts/test-marketing-expert.mts` 检查一致性。
