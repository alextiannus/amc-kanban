# Instagram / TikTok 草稿轮播发布

2026-11-17：已实现并完成下列本地验证；Git 交付以仓库提交记录为准，部署与真实发布验收待完成。

- Instagram：单视频默认 REEL；单图默认 TIMELINE；2–10 个图片、视频或混排素材为一条 TIMELINE 轮播。显式 REEL 只接受一个视频，STORY 只接受一个素材，TIMELINE 不接受单视频。
- 多视频及图视频混排轮播忽略旧草稿的独立视频封面，不读取、校验或上传该闲置封面；失效或超过 Reel 封面限制的旧封面不能阻止轮播。单视频和纯图片帖沿用原封面规则。
- TikTok：保留单图和单视频；2–10 张图片为图片轮播。多视频及图片视频混排在提交前拒绝。不新增音乐选择功能，保留既有音乐字段规则。
- 新建和编辑共用有序素材列表，支持批量上传、素材库选择、删除、前移后移、逐项预览。mediaUrls 为完整发布顺序，assetIds 为对应素材库引用（外部 URL 无 assetId）；不能按两个数组的同一索引猜测身份。历史关联按 order 补齐，URL/存储 key 归一化去重。封面与正文分离，多视频和混排不附加独立封面。
- 复用 POST/PATCH /api/brands/:id/drafts 和现有 instagramPublishType、mediaUrls、assetIds、coverAssetId 字段，无数据库迁移。保存草稿允许保留尚未满足发布条件的内容；提交、审核、排期、队列、重试及直接 PostFast 调用以相同规则校验实际正文列表。MM 代理继续转发至 Kanban。
- PostFast 请求只创建一条 posts[] 记录，mediaItems 每项包含 key、IMAGE/VIDEO、从零连续的 sortOrder；保留实际媒体类型及用户顺序。沿用上传队列和未知结果核对，不自动重复创建帖子。
- 参数建议仍为 warning，确定性组合错误为结构化 422；轮播不允许位置标签或 Trial Reel 策略，不静默丢弃不兼容控制字段。
- 验收覆盖 2/10/11 项、混排、单视频、显式发布类型、混合来源顺序、刷新恢复、局部上传失败、手机/桌面，以及提交/队列/重试。模拟接口测试不能替代真实社交发布。先部署 Kanban，再部署 MM；指定账号真实验收另记。

接口依据：https://postfa.st/api-guides/instagram/carousels 、https://postfa.st/api-guides/tiktok/carousels 、https://postfa.st/docs/posts/create 。按 PostFast 的 10 项上限，不将 Meta 其他接口上限直接用于本通道。

## 本地验证

- 两端 `npm run typecheck`、`npm run test:carousel-publishing` 通过。
- Kanban 媒体校验、PostFast 模拟接口、队列阈值及流式传输回归通过；覆盖 2/10 项成功、11 项及不兼容组合在上游调用前拒绝、媒体类型/顺序及独立封面。多视频使用现有持久队列。
- MM 新建草稿回归通过，包含 320/390/768/1440px、TikTok 图片轮播顺序与排期、非法混排不提交、上传/素材/外链、回执和权限已有场景。已有草稿回归覆盖四种宽度、Instagram 显式类型切换、TikTok 素材排序及删除外链后保留素材关联。
- Kanban 本地组件模拟页面通过桌面 Instagram 和 320px TikTok 轮播排序、保存及请求回读；未执行真实社交发布。
- MM Webpack 生产构建通过。Kanban 编译、类型检查、静态页生成及早先一次占位连接构建通过；最后一次构建在 Next.js 依赖安全检查处以 `SecurityFatalError` 结束，不能作为最终构建通过或可部署的证明。该检查未通过前不部署；本轮未升级依赖。Kanban 构建使用仅供打包的本机占位 DATABASE_URL，不访问生产数据库。
