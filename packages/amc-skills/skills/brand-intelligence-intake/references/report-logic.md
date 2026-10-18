# Report Logic

Brand Intelligence Intake produces customer-facing local lifestyle merchant reports. Do not expose internal strategic acronyms or implementation mechanics.

## Freshness

- Freshness window: 60 days.
- Same brand key and same report email reuse an initial report inside the freshness window.
- `force_refresh: true` always regenerates.
- Advanced report requests generate advanced output even when an initial report exists.

## Initial Report

Name: `本地生活商家品牌网络运营评估`

Use it for public website intake and lead generation.

Required sections:

1. 报告摘要
2. 证据采集概览
3. 品牌基础档案
4. 线上存在感检查
5. Google Maps 与本地搜索表现
6. 评价与口碑概览
7. 社交媒体覆盖与活跃度
8. 基础竞品观察
9. 品牌网络运营初步评分
10. 优先提升建议
11. AMC 可协助方向
12. 数据来源与缺口

## Advanced Report

Name: `本地生活商家品牌网络运营深度评估报告和提升建议`

Use it for internal AMC analysis, deeper sales consultation, owner review, or paid assessment.

Required additions:

- Collector module run status
- Evidence source inventory
- Website and conversion path deep assessment
- Google Maps and local search deep assessment
- Social media operations assessment
- Trade-area, industry, and competitor analysis
- Competitor social-media performance section
- 30/60/90 day improvement suggestions
- Data gaps and next collector plan

## Missing Data Rule

Use `暂无数据` for missing values. Do not replace missing metrics with generic advice unless the advice is explicitly framed as a next step.

## Report Tone

- Practical, specific, and merchant-value oriented.
- Avoid technical collection details except in data source or evidence sections.
- Recommendations must connect to discoverability, trust, content operations, or conversion.
