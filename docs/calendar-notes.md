# 发布日历备注、标题与文字助理

状态（2026-11-03）：本地已实现，尚未执行生产迁移、部署及真实账号连续对话验收。提交与推送状态以 Git 为准。

## 日期记录与接口

MM 沿用品牌 API 代理，Kanban 负责存储和品牌 READ / WRITE 授权。只读成员可查看，写权限成员可修改。未登录 401，无权限 404，响应均为 `Cache-Control: no-store`。

每天每品牌一条 `CalendarNote`，唯一键 `(brandId,date)`。字段为 `id,brandId,date,title,body,version,createdBy,updatedBy,createdAt,updatedAt`。日期为有效公历 `YYYY-MM-DD`（0001–9999），不转换成 UTC 时间点。标题默认空字符串、单行、最多 40 个 Unicode 码点，去除首尾空白并拒绝控制字符。正文最多 2,000 个 Unicode 码点，保留换行及空格，CRLF/CR 规范为 LF，禁止 NUL。

| 方法与路径 | 输入 | 成功响应 |
| --- | --- | --- |
| GET `/api/brands/:id/calendar-notes?month=YYYY-MM` | 必填有效月份 | `{ok:true,notes:CalendarNote[],canEdit:boolean}`，按日期排序，含已清空的版本记录 |
| PUT `/api/brands/:id/calendar-notes/:date` | `{title:string,body:string,expectedVersion:number\|null}` | `{ok:true,note:CalendarNote}` |

首次保存 `expectedVersion:null`；更新提交读取到的正整数版本。标题和正文原子保存，共用递增版本。唯一键冲突或旧版本返回 409 `calendar_note_conflict`，禁止静默覆盖。旧客户端省略 `title` 时，普通正文更新保留已有标题；清空正文仍清除标题及正文。新客户端显式提交两项。只写标题、正文空白返回 400 `calendar_note_body_required`；两项为空表示清空，保留记录与递增版本。日期、正文、版本非法返回 `invalid_calendar_note`，标题非法返回 `invalid_calendar_note_title`，月份非法返回 `invalid_calendar_month`；存储异常返回 500 `calendar_notes_failed`。

## 日历界面

所有日期格统一加高，数字下方用浅色标题条展示备注，字号 9px、行高 11px、常规字重，最多两行并在溢出时省略（2026-11-04 本地调整，待部署）。无标题时显示正文第一行非空文字，不改写保存值。点击整个日期格查看完整标题、正文、最后更新时间。今天、选中日期、发布排期标记保持原有含义；备注不计入发布数量，不受发布状态筛选影响。

编辑卡片含可选标题、多行正文、字数提示、编辑、保存、取消及确认清空。正文不能为空，删除使用明确的清空操作。标题或正文修改均纳入日期、月份、品牌及离开日历的未保存保护；保存失败和冲突保留两项输入。冲突后主动重新读取并核对最新内容，不自动重发。刷新/关闭沿用 `beforeunload`；异步请求按品牌、月份和日期隔离，旧响应不得覆盖新页面。
复查已补齐助理跳转页面/月份及日历创意编辑、制作入口的保护；等待保存或放弃选择之前不执行页面状态修改。对应实际 dashboard handler 测试覆盖取消和确认后的状态变化。

## 文字助理上下文

备注保存不创建 AI 请求、不改写已有任务。下一轮通用助理或品牌策划对话均从日历数据库读取最新日期、标题、正文和版本。MM 对话请求可选 `calendarContext:{month:"YYYY-MM",date?:"YYYY-MM-DD"}`；日期必须属于月份，拒绝额外键。品牌范围来自服务端授权身份。

`amc.context.calendarPlanning` 包含 `status,timezone,months,selectedDate,revision,monthRevisions,total,notes,index,completeMonths,unreadMonths,truncated,instructions`。默认读取品牌时区本月、下月、当前查看月份；正式策划的 `planningScope.startMonth` 也加入范围。旧客户端使用服务端默认。`notes` 是完整正文，`index` 仅是日期、展示标题和版本摘要。默认日历投影限制在 8,000 个 Unicode 字符（按 JSON 序列化后计），优先放入所选日期，显式标注未读月份，不能把标题摘要当成正文。

只读工具 `amc.calendar_notes({month,afterDate?})` 按日期分页，每页最多 8 条完整备注，返回 `status,month,afterDate,revision,notes,nextAfterDate`。从不传 `afterDate` 开始，沿 `nextAfterDate` 读取至 `null`。只允许 conversation，沿用助理现有身份授权；工具输入不接受品牌 ID。正式策划遇到未读月份，完成校验要求取得当前版本全部分页；其他月份可按需读取。读取失败返回 `unavailable`，与可用但没有备注严格区分。

当前明确用户请求优先于备注，最新备注优先于旧 AI 建议。备注只适用于写明的日期和文字范围，不成为长期品牌事实或执行授权。与策略、排期、任务冲突时说明差异并由用户决定，不自动修改。相关回复须说明采用的日期和标题。已清空内容不得从旧对话恢复；读取不可用时明确说明限制，不声称查过或没有备注。
正式策划校验也覆盖默认范围之外已按需读取的月份：必须从首个分页读取到末页，最近一次读取为 unavailable 时不得保存。上下文及实际 application verifier 均有回归测试。读取日历和策略文档后出现内部草稿写入结果不明，仍显示原有草稿恢复入口；未知外部操作或未知读取继续走原任务核对，不自动重发。

缓存版本含清空记录的版本及修改时间、品牌、时区和月份范围。标题、正文、清空和跨成员修改都会使旧上下文失效；Core 在实际模型输入组装时重新读取。回复校验重新检查默认范围及已按需读取月份。正式策划保存事务持有 Brand 行锁，与备注保存互斥并再次校验版本；变化返回 409 `calendar_notes_changed`，不会保存旧计划。`applicationVersion` 纳入日历模块；上下文 manifest schema v2 记录日历来源状态、版本及内容指纹，不记录私人正文。元数据缓存保留现有 30 分钟 TTL，日历正文每次访问取最新值。

## 本地验证与边界

- 两仓库 TypeScript 检查、接口和客户端测试、现有日历回归。
- 真实 Calendar 组件的隔离 API 浏览器测试覆盖 320 / 390 / 768 / 1440 像素、共享只读、标题、首行回退、字数限制、标题单独修改保护、冲突保留输入、确认清空、网络失败、跨年、品牌与旧响应隔离及中英文。
- 上下文测试覆盖品牌时区月份、闰日、8,000 字符限制、分页及过期分页拒绝、标题/清空失效、读取不可用、通用与 Profile 策划同源、实际 Core 模型输入组装、版本指纹隐私及策划保存前事务校验。均使用隔离数据，不产生真实 AI 请求。
- 原始建表与标题扩展 SQL 在隔离 PGlite PostgreSQL 中验证，历史正文、日期、版本保留；不是生产迁移证明。

真实模型回复中的日期引用、重新登录和跨真实账号读取仍需生产验收；本地组装测试不代表真实模型行为。既有 MM 的 calendar-refresh-editor、calendar-creative-revisions-ui、calendar-replication-navigation 脚本有与既有界面不符的旧定位，不能用作本轮通过证据；MM 未配置 ESLint。
扩展回归中，`test-sku-context-loading.mts` 在本次修改前的 service 代码上也复现相同的 allowedTools 空数组断言失败，本次未改动 SKU 流程。Kanban 现有 calendar-drafts npm 命令在本机 Node 22 的 strip-only 模式不支持参数属性，改用 `npx tsx scripts/test-calendar-drafts.mts` 验证通过；MM 对等源码测试已统一 CRLF/LF 后通过。

## 发布顺序与回退

1. 通过数据库发布流程确认原 `20261103090000_calendar_notes` 已应用；新库依顺序应用原迁移，再应用新增的 `20261103100000_calendar_note_titles/migration.sql`。不要改写原迁移或对已有字段重复执行 SQL。
2. 生成 Prisma Client，再部署 Kanban `main`；先验证标题 GET/PUT、旧客户端保留标题及清空、权限和并发 409。
3. 再部署 MM `main`；真实账号保存下月备注，在原对话连续询问策划，检查实际模型输入及回复；修改、清空、其他成员修改后再次询问，核对版本、日期和方向。
4. 回退 MM / Kanban 时保留表、标题列及记录，不执行 DROP。代码推送、生产迁移、部署和生产验收分别记录。
