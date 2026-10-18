---
name: amc-brand-planning
description: "AMC 品牌策划旧入口，兼容既有引用；新品牌营销共创流程使用 AMC 营销专家 amc-marketing-expert。"
---

这是兼容入口。外部安装后读取同级 `../amc-marketing-expert/SKILL.md`；站内通过 `assistant.skills.read` 读取 `amc-marketing-expert/SKILL.md`，按该技能完成AI Insight、品牌访谈/品牌定位、完整品牌营销策略的多轮共创。使用当前 `amc.context` 的可信任务及输出契约，不沿用旧报告日期或其他品牌的结论。
