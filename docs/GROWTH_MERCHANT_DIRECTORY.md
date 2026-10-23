# Growth 商家只读目录

新增 `GET /api/internal/growth/merchants` 及 `GET /api/internal/growth/merchants/:brandId`，以 `CONTENT_SERVICE_INTERNAL_TOKEN` 校验请求头 `x-content-service-token`。

列表参数 `q`、`page`、`limit`，默认每页 20、最多 50；搜索名称、地区、地址，排除归档商家。详情仅返回必要商家信息、门店和有效公开账号，不返回访问令牌、密钥或所有者信息。过滤已解绑及未配置账号，社媒账号按品牌共享账号标注。

没有数据库迁移，没有写入接口，也没有修改 Kanban/MM 的 V3 报告入口。Google 标识只分配给明确对应门店，不能将品牌 Google 标识默认套给任意分店。

验证：`npm.cmd run test:growth-merchant-directory`、`npm.cmd run typecheck:growth-merchant-directory`。全量类型检查受当前共享旧 Prisma 生成客户端影响，既有 activity-page 路由缺少 activityPage / followRewardDescription 类型；未修改该路由。

先部署本接口，再部署 Growth；双方配置相同内部令牌，Growth 配置 `AMC_KANBAN_URL`。本地验证不代表已经推送、部署或完成真实商家验收。

本次工作区独立于主 Kanban checkout，保留原有未提交改动。
