# MM 发布日历新建草稿接口（2026-11-05，MM 代码已推送；部署、生产验收未核实）

2026-11-06 源码交付：MM 的 main 已推送并通过 git ls-remote 核对为 [865e50768269b64fc531e72f3b18f2dd4c95381c](https://github.com/alextiannus/amc-mm/commit/865e50768269b64fc531e72f3b18f2dd4c95381c)。新建草稿回归与类型检查在提交前再次通过。Git 推送不作为部署或真实 AI/发布验收证明。

本入口沿用现有接口，不增加数据库模型或业务端点。所有调用使用当前品牌与会话权限；日历 calendar-notes 返回的 canEdit 控制入口，写请求仍由 Kanban 独立鉴权。

| 行为 | 现有接口 | 约定 |
| --- | --- | --- |
| 账号、Google 门店 | GET /api/brands/:id/accounts；GET /api/brands/:id/accounts/:accountId/gbp-locations | 过滤内部占位账号，多账号明确选择 |
| 素材 | GET /api/brands/:id/assets、/folders；现有 presign-upload / confirm-upload | 目录分页，复用 OBS 直传，封面仅同品牌 JPEG/PNG |
| AI 候选 | POST /api/content/generate（MM） | brandId、platform、theme、mediaUrls、assetIds、requestId；只返回候选，不自动创建草稿或重试 |
| 保存 | POST /api/brands/:id/drafts；PATCH /api/brands/:id/drafts/:draftId | caption 必填；accountId、hashtags、完整有序 mediaUrls、assetIds、coverAssetId、gbpLocationId、postfastControls；普通保存 status=draft，POST 的 scheduledAt=null，PATCH 清空时传空字符串 |
| 推荐 | POST /api/brands/:id/scheduling/recommend | 推荐未来时间后供用户确认，不静默使用任意兜底时间 |
| 排期 | PATCH 草稿写 scheduledAt，然后 PATCH /api/brands/:id/drafts/:draftId/submit | 未绑定账号不提交；仅以 submit 的确认响应判定成功，沿用发布校验及 warning |

每个平台保留独立草稿 ID、生成候选、保存状态与错误。成功 POST 后只 PATCH 原 ID；部分失败只重试失败项；网络断开、无法解析的成功响应或 5xx 写回执保持未知并阻止重发。已有 ID 的未知提交可 GET 原草稿核对，只有确认实际状态后才解除未知；未知创建无可靠 ID 时需在日历核对，面板不会重建。已成功提交的项目不能再次编辑或提交。取消面板不删除已上传素材或已保存草稿。页面退出处理未保存内容，异步结果不得写入其他品牌。日历由父容器刷新并切换草稿/排期筛选。

提交响应必须包含 ok=true 及已知 mode。scheduled / queued 表示已确认排期或进入队列，不表示已发布；approval_required 表示提交审核，日历切到“待处理”；draft 仅表示保留草稿，不显示排期成功。返回格式未知保持写回执未知。已写入时间但提交明确失败后，普通保存会重新清空 scheduledAt。Google 已连接账号须选择实际门店，未配置平台仍可保存未排期草稿。TikTok 的 postfastControls.tiktokIsAigc 明确保存 true/false。

浏览器回归使用模拟 AI 与发布响应；真实付费生成及生产发布不是自动测试的一部分。功能实施、Git 推送、部署、生产验收分别标注。

## 本地验证

2026-11-06 复查修正已包含在上述 MM 提交，部署及生产验收未核实：保存完整且有序的 mediaUrls，并保留 assetIds 作为元数据关联，确保 MM 重新打开可见素材且发布不重复；PostFast 素材保留相对文件代理路径，以复用既有 storageKey 去重。普通保存 POST 使用 scheduledAt=null，PATCH 清空通过现有接口支持的空字符串传递；浏览器测试模拟真实 PATCH 忽略 null 的行为。上传传递所选 folderId，确保素材进入所选目录。目录及用途提示的 Escape 先关闭自身，不触发编辑面板离开确认。AI 改写同时传入当前人工正文和创作主题，返回候选供用户采用。

本次类型检查、新建流程四种屏宽及日历草稿回归通过；另用真实 Kanban buildPostfastMediaItems 与 MM 保存载荷联测，验证外部链接、PostFast 文件和 OBS 素材混排后顺序不变、无重复且保留素材元数据。未执行真实 AI 付费调用或生产发布。

- MM 类型检查、test:draft-composer（请求契约及实际日历集成）、test:calendar-drafts、test:calendar-notes、test:calendar-notes-ui、test:dashboard-navigation 通过。
- 新建流程覆盖 320/390/768/1440px、中文/英文及深色主题、目录与 OBS 模拟上传、素材链接/顺序/封面、AI 候选与独立重试、多账号/Google/TikTok、部分成功、未知回执及读回、审核/排期/失败恢复、只读、关闭焦点及跨品牌保护。AI 与发布均为本地模拟。
- test:historical-post-accounts 的 openHistoricalPostForm 静态源码断言失败；当前 HEAD 同样不存在该匹配，未改动历史录入流程或该测试。
- 仓库无 eslint.config 配置，现有 ESLint 命令无法启动；未将其记录为通过。工作区原有未跟踪内容保留。
