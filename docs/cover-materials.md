# 封面素材与发布草稿

状态：2026-11-04，本地实现并通过专项验证；生产迁移、历史回填和线上验收尚未执行。

封面素材是固定用途视图 COVERS，与原始素材、AI制作成果、人工加工并列，说明为“集中管理发布封面图片，可在新建草稿和排期时选择；原目录与来源类别保留。” 不可改名、移动、删除或创建子目录。MediaAsset.isCoverMaterial 为独立布尔字段，默认 false；不改变 materialClass、folderId、素材 ID、文件或脚本引用。第一版仅 JPEG/PNG，不做截帧或格式转换。

素材卡片、批量操作支持设为/取消封面，沿用实时品牌写权限；跨品牌或含不合格格式的批次整体拒绝。既有技术元数据作为格式依据，历史缺少可靠元数据的素材先检查原媒体，再提交版本校验。设为封面不让 AI 分析覆盖人工归档。取消用途不清空已保存草稿的 coverAssetId。

封面列表支持缩略图、大图、搜索、24 条分页和批量取消；上传自动设置 isCoverMaterial=true，来源类别单独选择，默认 UNCONFIRMED，可信 AI 来源仍由服务端标记 AI。其他三个入口上传继续继承来源类别。目录接口 roots 保留三类，新增 views 返回固定用途入口及写权限，旧 MM/Content 消费者忽略 views。

发布草稿默认“封面素材”，保留“全部图片”，均为当前品牌 JPEG/PNG，不受类别/使用次数限制。选择图片并成功保存草稿时自动标记封面；取消编辑不写标记。空列表显示“尚未设置封面素材”，可切换全部图片或进入当前品牌素材库封面入口。继续用 coverAssetId 和既有发布规则。

接口：素材 GET 增加 coverOnly=true/false 并返回 isCoverMaterial；mediaType=cover 仍表示 JPEG/PNG，旧 mediaType=cover&folder=封面图 兼容到用途查询，不再按名字查。Dashboard 的 COVERS 导航使用 coverOnly=true，不能向 materialClass 传 COVERS。上传/更新及 MCP 增加 isCoverMaterial，同一服务校验和审计。已有草稿封面无需用途标记也仍可显示、保存和发布。

历史回填独立脚本：先只读 preview，收集旧“封面图/封面素材”目录及后代的 JPEG/PNG，以及现有草稿明确 coverAssetId 引用。预览保留来源依据、当前用途值、版本和分类/目录信息；显式 apply 经核对摘要、品牌写权限、逐条媒体格式和 CAS 校验，只更改用途。回执和审计保留前后值；rollback 校验用途与版本，不覆盖后续操作。运行时不按名字自动补标记，取消后不重新出现。

先更新文档，再 additive migration、共享服务、素材库/排期、MCP 和回填脚本。迁移先于新代码；回填必须在人工核对预览后，先单一测试品牌再推广。回滚应用保留新增列与审计，数据回滚独立使用回执。不自动执行生产回填。

验收：三类及待确认图片可标记；假 MIME、视频、其他格式、跨品牌、只读拒绝；列表/数量/分页与排期一致；改名移动不影响用途；保存草稿成功才标记；取消标记不破坏已有草稿；回填预览/apply/rollback/并发冲突与 ID 保留；手机选择和预览；自动选材仍限定 ORIGINAL。

## 本地验证与交付边界

类型检查（应用与回填脚本）、新服务 ESLint、真实 PostgreSQL 嵌入式事务与迁移验证通过。覆盖四种来源类别、实际 MIME 不符/视频拒绝、批次原子性、权限/品牌隔离、失败草稿回滚、跨平台同封面幂等、旧目录后代回填/回滚及并发冲突。实际素材 GET 的分页与旧封面查询兼容测试通过。实际界面 1440/390px 覆盖固定入口、用途说明、分页/数量、批量取消、上传来源默认值、草稿全部图片选择/取消/保存和空状态；UI 使用本地授权夹具，不等同生产验收。分类分析保护回归通过。

发布必须先执行 additive migration `20261104170000_cover_material_purpose`，再部署 Kanban（页面/API/MCP）。此次不需要更新 MM/Content，roots 保留三个来源，views 为增量字段。由于 Prisma 常规查询也会读取新列，不能先部署新代码再补迁移。生产部署、真实品牌回填及发布平台联调未执行。

执行命令：`npm run materials:covers -- --brand BRAND_ID --out preview.json`，只读生成预览与摘要。每批最多 500 条，输出 totalCandidates；剩余素材需重新生成并核对下一批预览。核对后运行 `npm run materials:covers -- --apply preview.json --digest SHA256 --actor USER_ID --receipt receipt.json`；回滚为 `npm run materials:covers -- --rollback receipt.json --actor USER_ID`。回执文件独占创建，禁止覆盖。若数据库提交成功而本地回执写入失败，按品牌、操作者与预览素材 ID 从 ASSET_COVER_PURPOSE_UPDATED 审计恢复 receiptId，核对后重建 committed 回执，不能盲目重复 apply。手动标记/取消的图片带用途覆盖标识，历史回填会跳过；回滚只恢复用途及其前值覆盖信息，不移动素材。
