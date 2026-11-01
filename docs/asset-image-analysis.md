# 品牌素材库图片与视频分析

状态：2026-11-01 按当前实现核对并统一正文；模型配置、服务启用与真实识别质量分别验收，不能把代码存在视为全品牌已启用。

## 范围与触发

支持图片和视频。上传后以 analysisBatchKey 持久化入队；历史素材支持选中分析和全库未分析补全，不受页面200条限制。关闭配置时上传照常保存、不调用模型；存量不自动全量分析。

任务以数据库租约防重复推进，刷新关页不丢失。普通批次在品牌时区夜间窗口执行；runImmediately或明确force运行不受窗口限制。窗口默认02:00–06:00，由现有policy定义。用户未完成上传的批次在最后新增素材十分钟后可封闭；仅重试明确失败项，未知上游结果不得自动重复提交。

## 输出与归类

优先使用Brand.industry与品牌简介。分析保存内容类型、说明、3–7个视觉标签、需核对标志、主体、拍摄类型、文字信息、画质、检索词及重复线索；视频另保存有效时间范围的AssetVideoSegment。重复线索用于分组，不自动删除原件，不宣称精确去重。

依据行业模板映射标准目录。仅素材在分析期间未被人工修改，且原目录/分类仍为空或raw/素材库/待确认时，自动分配已存在的标准目录并更新aiCategory；已有人工目录保持。低质量或不确定素材可映射至不建议使用或待确认标准目录，而不是假装识别成功。

重分析保留人工标签与说明，分析期间的人工编辑优先；不借分析修改aiReady、原URL、发布状态或已选镜头。视频片段索引按analysisVersion写入；原视频保留。

批次完成生成目录建议，人工仍可选择现有目录、新建普通目录、调整或跳过，再经apply事务确认。确认校验素材快照、品牌归属和目录有效性，重复确认幂等，并发移动不覆盖。普通目录可管理，系统目录受保护；删除普通目录只回根、不删除媒体。

## 接口与服务

- GET /api/brands/:id/asset-analysis：列表或按batchId明细。
- POST：scope=selected|unanalyzed、assetIds、language，返回持久批次。
- PATCH：action=retry|apply|seal；apply携带assignments。
- /api/brands/:id/folders：沿用目录管理与品牌权限。
- /api/cron/asset-analysis与常驻worker推进既有队列；保持租约和任务配置绑定。
- Kanban通过既有Content服务连接调用分析capabilities/jobs；Content连接生成网关。image/video任务使用asset_image_analysis、asset_video_analysis；批次目录汇总按当前服务实现，不把历史asset_category_summary规则当作始终调用的步骤。
- 模型选择与凭据遵循中央ModelConnection/ModelCatalogEntry和任务配置绑定。ANALYSIS_MODEL中的默认名不代表可绕过中央模型发布；禁止将AI凭据迁回环境或旧SystemConfig。

## 验证与上线

保持既有任务ID、请求幂等键与配置版本；更换服务必须继续查询原任务。分别核对中央模型能力、Content连接、功能开关、队列推进及图片/视频真实结果。生产只读盘点不得触发分析。

本地test-asset-image-analysis.mts覆盖品牌隔离、入队、幂等、部分重试、人工编辑保护、确认归类与系统目录；test-asset-library-templates.mts覆盖行业映射。上述为隔离模拟/规则验证，不代表生产识别质量。

真实验收需覆盖图片与视频、缺行业、不可读文件、错误结构、结果未知、重复线索、原片保留、人工修改及跨品牌拒绝。当前生产数据覆盖见共享VERSION_HISTORY与资产基线报告；没有记录的覆盖标未知。
