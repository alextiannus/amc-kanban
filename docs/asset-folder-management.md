# 素材目录管理与类别

状态：2026-11-04 本地已实现并通过目录数据库、界面与选材隔离验证；未推送、未部署，真实品牌验收待执行。

## 当前产品约定

保留素材库「管理文件夹」入口，窗口展示可搜索、可展开的目录树。标准目录存原始素材；自定义目录存加工素材，首次提供人工剪辑、AI 制作。主理人及原有品牌写权限成员可管理授权品牌，查看权限不授予写操作。标准一级可改显示名，systemKey 固定，不可移动、删除。自建目录可新建、改名、移动、删除空目录；最多三级，品牌内名称唯一。新建、改名、移动、删除确认均使用内嵌表单。旁边 + 打开同一新建表单。手机端使用底部抽屉。

素材类别独立于上传渠道 sourceType、目录名称和片段/成片形态。materialClass 为 ORIGINAL、MANUAL、AI、UNCONFIRMED；materialForm 为 UNKNOWN、CLIP、FINISHED。标准目录及其子目录限定 ORIGINAL；自定义顶层限定 MANUAL 或 AI，子目录继承。上传展示类别；已知 AI 生成入口强制 AI。跨类别移动需确认，不得通过改名改变类别。人工归档与分类不被 AI 分析覆盖。

自动匹配只查询 ORIGINAL，并沿用质量、权利、相关度及品牌范围；不足提示补充，不自动放宽。人工选择可使用加工素材，已选历史引用不因分类变化失效。改名/移动保持素材 ID、文件及素材集引用。历史无法证明来源的素材默认为 UNCONFIRMED，不凭上传渠道、文件名或现有目录推断为原始。

## API

- GET /api/brands/:id/folders：平铺树记录 parentId、materialClass、revision、assetCount、subtreeAssetCount、depth、path 和 canCreateChild/canRename/canMove/canDelete；顶层 canCreate。
- POST 同路径：name、parentId（可空）、materialClass（新客户端顶层显式选择 MANUAL/AI；旧客户端省略时默认 MANUAL）；子目录继承类别。标准一级由模板生成。
- PATCH 同路径：folderId、revision、name 和/或 parentId。移动要求同类别，禁止环与超过三级；标准一级只改名。revision 必填，过期返回 409。
- DELETE 同路径：folderId、revision 查询参数；只删除无素材且无子目录的自建目录。旧 name 定位保留兼容，但仍需 revision，且遵循相同权限与删除规则。
- 素材列表增加 materialClass、folderId、includeDescendants；保留 folder 和 sourceGroup 的原含义。人工选择器使用 materialClass；默认自动匹配由服务端限定 ORIGINAL。
- 上传及素材 PATCH 接收 materialClass、materialForm、folderId。跨类别调整要求 confirmMaterialClassChange=true，分类/归档留审计。已知 AI 来源不可改为 ORIGINAL/MANUAL。

写操作在事务内锁定品牌目录空间、校验当前版本和品牌写权限，冲突不覆盖输入。目录改名同步兼容 aiCategory，但 folderId 为真相。读取不把旧素材自动归为原始。

## 数据整理与发布

先部署新增默认字段的兼容 migration，再部署 Kanban API，随后 MM、Content 和页面。历史整理脚本默认只读预览，显式 apply 前核对清单；保存每条前值，CAS 更新防止覆盖并发编辑，支持按报告回滚。不删除、移动 OBS 对象。先在测试品牌验证，未完成真实品牌试用不得称生产验收。

验收包含权限、树深度/环/重名、改名后初始化、空目录删除、并发冲突、失败保留表单、手机端、AI 不覆盖人工归档和默认选材排除加工/待确认。固定人工标注样本比较正确数及耗时，合成测试不能代替真实运营效果。

## 本地验证与发布交接

- Kanban/MM/Content 类型检查通过；新增目录服务在嵌入式 PostgreSQL 执行真实新增 migration 与事务，覆盖权限、品牌隔离、改名后初始化、环/深度、非空删除、版本冲突、分类确认、AI 保护和引用 ID 保持。
- 真实组件 Chromium：管理窗口在 1440px 桌面、390px 手机通过新建、改名、移动、空目录删除、搜索、重复名及冲突保留输入，主页面 + 使用同一表单。MM 既有选材回归通过 320/390/768/1440px。
- Content 固定四类标注夹具：旧规则候选 4 份中仅 1 份为原始；新规则仅选中该 1 份原始。CPU 耗时只作本地合成指标，不等同真实运营用时或语义相关度。实际样本和主理人操作计时待测试品牌验收。
- REST 与 MCP board_upload_asset/board_update_asset 共用归档服务；board_list_assets 支持 folderId、materialClass。Designer、VideoDirector、AI 视频、成片保存均显式标记 AI；上传渠道不替代类别。新生成媒体生产存云端，开发本地媒体通过授权动态路由读取。
- 未配置独立本地 PostgreSQL DATABASE_URL，完整 VideoProductionJob 入库集成套件未执行；本次嵌入式事务覆盖不能替代该套件或生产存储联调。

发布顺序：先执行 `20261104090000_material_folder_management` migration，再部署 Kanban（API/页面/MCP），随后部署 Content 和 MM；逐端核对提交和类别响应，不能只看健康检查。发布前保留数据库备份。

历史整理使用 `npm run materials:classify -- --help` 查看预览/apply/rollback 参数。先按单一测试品牌预览并核对 digest；只有明确生成入口或人工 labels 作为类别证据，其余待确认。apply 的前值和结果写入审计及独占创建的 receipt；CAS 检查阻止覆盖并发编辑。回滚使用同一 receipt 并再次校验当前版本；原目录已删除时停止，不误恢复位置。数据库事务成功而本地 receipt 写入失败时，从 MATERIAL_CLASSIFICATION_APPLY 审计恢复回执后操作，不重复盲目 apply。

应用回滚保留新增列、目录与审计，不执行破坏性 down migration；分类数据若需恢复，单独按已核对 receipt 回滚。生产迁移、真实品牌历史整理、物理手机和真实 OBS 验收均未在本次执行。
