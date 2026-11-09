# 每用户每月 Token 提醒预算与品牌月报

请求与批准：AMC-20261109-TOKEN-BUDGET-006。每位现有及未来用户每个新加坡自然月USD100，仅提醒，不暂停。原生模型的调用额度/并发/重试/业务权限不因此改变；这不是充值、支付、视频AMC Credit或广告预算。

统一策略来自 `src/lib/token-budget/policy.ts`。`GET /api/profile/token-budget` 仅返回当前用户的跨品牌合计与策略，个人AI设置显示预算和费用是否完整；`GET /api/admin/token-usage?month=YYYY-MM` 仅管理员可以读取整月所有品牌/用户。接口不依赖模型网关可用性，不返回模型输入、输出、凭证或推理。

统计只读原生 Core `amc_iaic.iaic_token_calls/entries`，任务映射以taskId去重。只统计完整确认的输入+输出；缓存是输入的子集，推理已包括在输出。未知/未结算另计，未发生调用的现存品牌包含零行。按调用创建时间归属新加坡自然月，晚结算可使后续复核数值更新。日均除以该月自然日，单次平均除以有完整用量的模型调用，人均除以有确认用量的活跃用户；全部品牌平均包含本账本零调用品牌。缺少归属单列。此账本未包含的旧路径/Content/Growth调用不在统计范围，不能把未覆盖调用解释为零。

费用仅使用调用时固定的、有版本的真实费率：模型 `definition.costMetadata.providerCostBasis` 遵循 Core公开 `iaic.provider-cost.v1` 合同，明确currency/minorUnitScale/inputPerMillionMinor/cachedInputPerMillionMinor/outputPerMillionMinor/missingCachedInput/accountReference/revision/model。原配置验证物理模型，Core计价快照固定本次policy alias及版本。没有价格就保持未计价，禁止用平台计账单位换算美元、用新价回填历史、或暗中把CNY按USD处理。`knownCostUsd` 是按确认用量和费率计算的已知部分估算，不是假称供应商最终账单。用量存在但全未计价时返回null而非0。USD已知部分达到100即每用户每月一条站内通知；并发以通知唯一ID去重。未达100但成本不完整时不能宣称低于预算。

后台每5分钟只检查并发提醒，不暂停调用，也不发邮件/外部聊天。提醒跳转实际个人AI设置。月报已安排每月1日09:00 Asia/Singapore在当前Codex对话交付上个自然月全部品牌的表格；本地私有读取脚本从现有连接凭证调用管理员只读接口，生产配置和Token不进入代码/报表。

当前生产基线核实：模型策略27的glm-5.3无成本费率，12,534条原生调用均无cost_basis。这些历史记录可以统计Token，但不能伪造USD成本。用户提供实际供应商费率或确认公开标价来源后才能接通有效美元预算提醒。未知不等于零消耗。本次实现不会修改供应商凭证、模型路由或推测价格。
