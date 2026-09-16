# 品牌素材库图片分析

状态：代码已实现，待迁移、配置与部署验证。仅图片，不涉及视频分析或发布。

## 行为

上传后持久化入队，使用 doubao-seed-2.1-turbo；同次上传携带 analysisBatchKey，结束上传后封闭批次。独立入口的上传按单张批次处理。历史操作在服务器固定选中或全库未分析图片范围，不受页面 200 条限制。任务在服务器定时推进，刷新、关页不丢失。仅重试失败项，结果未知不自动重新收费提交。

优先 Brand.industry，结合品牌介绍，不猜测身份或具体菜名。内容类型、3–7 个标签、一句说明、需人工确认标志独立保存。模型只提供建议，不直接修改 aiCategory 或 aiReady。重分析保留人工标签；用户编辑说明后不得被正在运行的分析覆盖。

批次完成后按统一类型分组，优先复用已有普通目录，用户逐组改名/选择已有目录、逐图改组或跳过。不确定图片默认跳过。确认事务检查素材快照及目录有效性，重复确认幂等，发生并发修改提示刷新，不覆盖。

图片左上角信息按钮支持悬停说明、点击详情；移动端底部详情。说明与标签可编辑，失败可重试。普通目录可增删改，功能目录受保护，删除目录只回根，不删除原图。

## 接口与任务

- GET /api/brands/:id/asset-analysis：批次列表；batchId 参数查询明细。
- POST 同路径：scope=selected|unanalyzed、assetIds、language；返回持久化批次。
- PATCH 同路径：action=retry|apply|seal，batchId；apply 携带 assignments（itemId、folderId 或 newFolderName），未选项保留原归属。
- PATCH /api/brands/:id/folders：folderId、name；DELETE 保留原入口，事务回根。
- POST /api/cron/asset-analysis：要求 x-cron-secret；可每分钟调度。Node 常驻实例也每分钟推进，数据库租约防止并发执行。
- Kanban → Content → CN-gateway；网关使用 asset_image_analysis（单图片）、asset_category_summary（文字结果汇总）任务；固定模型，沿用 HMAC、幂等 job 和状态查询。
- 管理员 SystemConfig 只管理启用开关。Kanban 复用 AMC_CONTENT_SERVICE_URL / AMC_CONTENT_SERVICE_TOKEN，调用 Content 的 /v1/asset-analysis/capabilities 和 /v1/asset-analysis/jobs。Content 使用已有 AMC_CN_GATEWAY_BASE_URL / AMC_CN_GATEWAY_SHARED_SECRET 调用国内网关；Kanban 不再读取、返回或接收旧图片分析网关地址与密钥。旧数据库列暂保留兼容，不再生效。

## 上线与验收

先确保现有网关图片分析能力已发布，再部署 Content 中转接口及 Kanban；管理员仅开启分析。启用时通过 Content 检查固定模型与两类任务能力，失败则不保存启用。已存在的批次、任务 ID 和幂等键保持不变，切换链路后继续查询原任务；Content 必须连接同一网关。不开启时上传正常保存、不调用模型。存量不自动全量分析。

验证多行业、缺行业、不可读图片、异常 JSON、部分失败、幂等提交、关闭页面恢复、跨品牌拒绝、并发修改冲突、目录改删及不重建、人工标签/说明保留、原 URL/草稿/发布状态不变；运行类型检查、网关契约和功能测试。

本地验证命令：`npm run typecheck`、`npm run test:asset-image-analysis`；网关运行 `npm run typecheck` 和 `npm test`。功能测试使用隔离数据库模拟及 Content/网关响应，不调用付费模型；真实模型和生产数据库验收在部署配置后进行。
