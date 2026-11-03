# 发布日历日期备注 API

状态：2026-11-03 本地实现；尚未执行生产迁移、部署或真实账号验收。

本地验证：两仓库类型检查、日期备注接口/客户端测试、现有 calendar-drafts 测试、MM 日历预加载回归及 320/390/768/1440 像素真实 Calendar 组件浏览器测试通过。浏览器使用隔离 API 数据，覆盖共享与只读、保存及清空、文字上限、日期/月份/品牌切换保护、保存失败、版本冲突及延迟响应隔离，不代表真实数据库或生产验收。Prisma schema 校验及 Client 生成通过，数据库迁移未执行（本机 Docker 引擎不可用）。

已知验证限制：MM 没有 ESLint 配置，无法运行该仓库 lint。既有 calendar-refresh-editor 脚本的源码结束定位、calendar-creative-revisions-ui 的 View full idea 和 calendar-replication-navigation 的 View idea 定位与当前既有实现不匹配，回归未通过；未改动这些旧脚本。新增日期备注测试及两仓库 calendar-drafts 回归通过。

## 访问与数据

MM 沿用 `/api/brands/[id]/[...subpath]` 代理。Kanban 使用现有会话/API key 身份与品牌 READ / WRITE 检查，读权限可查看，写权限可新增、修改及清空。所有响应 `Cache-Control: no-store`。未登录 401、无对应权限 404，不暴露其他品牌内容。

`CalendarNote` 使用 `(brandId,date)` 唯一索引。日期是严格公历 `YYYY-MM-DD`（0001–9999），不是 UTC 时间戳。`body` 最多 2,000 个 Unicode 码点，保留空格和换行，CRLF/CR 规范为 LF；全空白规范为空字符串，禁止 NUL。记录 `id,brandId,date,body,version,createdBy,updatedBy,createdAt,updatedAt`。创建版本为 1，每次更新及清空递增。空正文记录仍返回客户端用于后续版本校验，但不显示日历图标。

## 接口

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| GET `/api/brands/:id/calendar-notes?month=YYYY-MM` | 必填合法月份 | `{ok:true,notes:CalendarNote[],canEdit:boolean}`，按日期升序 |
| PUT `/api/brands/:id/calendar-notes/:date` | JSON `{body:string,expectedVersion:number\|null}` | `{ok:true,note:CalendarNote}` |

首次保存 `expectedVersion:null`；已有记录必须提交读取到的正整数版本。服务端在事务中创建，或按品牌、日期、版本条件更新并回读；唯一键冲突与版本过期均返回 409 `{error:"calendar_note_conflict"}`。空正文清空但不删除记录，不提供删除接口。并发失败保留输入，不自动重发；用户主动重新读取，比较最新正文后再修改保存。

非法月、日期、JSON、正文或版本返回 400 `invalid_calendar_month` / `invalid_calendar_note`。后端异常返回 500 `calendar_notes_failed`。客户端加载错误提供重试，保存错误保留输入。备注和内容日历查询独立，单方失败不阻断另一方。

## 界面与保护

选中任意日期后在日历下方显示备注卡片。日期单元格以独立图标表示有备注，可与发布排期标记共存。自由文字按文本渲染。切换日期、月份或品牌，以及返回/菜单离开日历前，未保存输入提供保存并继续、放弃、继续编辑；保存失败不执行切换。关闭或刷新使用 beforeunload。旧请求结果不得覆盖切换后的日期。

## 上线与回退

1. 审核并通过现有数据库发布流程执行 `prisma/migrations/20261103090000_calendar_notes/migration.sql`；仅新增表、索引和外键，不回填或修改现有内容数据。
2. 生成 Prisma Client，部署 Kanban；验证已授权 GET/PUT、只读及跨品牌拒绝、并发 409。
3. 部署 MM，以真实账号在下个月空白日期保存，刷新及另一授权账号读取，验证修改、清空、换月和网络失败保护。
4. 回退 MM 界面及 Kanban 接口时保留表和数据，不执行 DROP。实现、推送、部署和生产验收分别记录，不以本地测试代替上线证明。
