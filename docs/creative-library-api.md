# 公共创意库搜索与品牌添加接口

状态：2026-11-11 本地实现及针对性回归通过；提交和推送以 Git 回执为准，部署及生产尚未验收。

- 既有 `GET/POST /api/brands/:id/ai/brainstorm` 新客户端附带 `library=1`，才在列表合并手动来源；未声明的旧客户端保留原推荐类型，避免 null 分数破坏旧版校验。返回可选 canSearchLibrary；手动项 sourceType=manual-library、matchingPolicy=manual-library-v1、matchScore=null，无视频时 videoStatus=not_provided。能力标记不替代权限校验。
- `GET /api/brands/:id/creative-library?q=&page=1`：每页24条；返回 brandId、canAdd、items、page、total、totalPages。每项包括 sourceId、sourceRevision、sourceDigest、title、platform、scriptKind、scriptTypes、thumbnailUrl、hasVideo、imported、blocked。
- `GET /api/brands/:id/creative-library/:sourceId`：权威原脚本和当前固定来源版本，媒体URL使用同品牌受保护代理。
- `GET /api/brands/:id/creative-library/:sourceId/media?sourceRevision=...&sourceDigest=...&kind=thumbnail`：预览媒体，复用来源媒体安全检查及 Range；每次复核公共库读取权限、来源状态及版本。
- `POST /api/brands/:id/creative-library`：只接收 `{sourceId,sourceRevision,sourceDigest}`。重新核验来源，返回 `{ok,brandId,sourceId,imported:true,replayed}`；无AI任务或日历写入。Cookie写入校验Origin。
- Content增加服务认证内部接口 `POST /v1/content-library/search`（q、page）和 `POST /v1/content-library/library-source`（creativeId，可选媒体投影 projection=media）；仅返回已审核可用来源的安全投影，不暴露后台元数据和凭据。

搜索/预览需 HUMAN、当前品牌读授权及 content.inspiration-library.read。添加另需当前品牌写授权及 draft.update；角色策略实时生效。导入后团队浏览/收藏/复刻仍走各自已有品牌权限，不要求团队成员具有公共库全库搜索权限。

关键词最多300字，普通文本包含匹配；标题完全匹配、标题包含、正文/标签匹配排序，同档 updated_at desc、id desc。空词显示最新；无视频脚本保留。手动导入记录独立于匹配批次，幂等键由品牌及来源派生，事务复用品牌资料锁，来源快照版本固定。

401登录失效；403缺少操作权限；404无品牌访问或来源不可用；409来源版本变化、撤审或商家已标记不喜欢；400参数不合法；503依赖暂不可用。已导入请求原样重试返回同一记录，不创建副本；同一固定版本的已提交回执不再依赖上游当前状态，来源随后更新或下架不会将已成功操作误报失败。请求版本与已导入版本不同返回409，不静默升级。重试仍复核当前角色与品牌权限，并禁止恢复不喜欢来源。

验收覆盖标题/台词/标签检索、字面通配符、空词与分页、纯脚本、添加与团队读取、推荐刷新保留、去重/并发/超时重试、版本变化/撤审/下架/不喜欢、角色撤销/跨品牌越权、媒体Range和手机/桌面返回位置。

## 本地验证（2026-11-11）

三仓类型检查通过；新增公共库SQL检索、品牌添加/权限/并发/事务回滚回归通过。既有来源身份、完整脚本、媒体安全/Range代理、创意浏览读取与权限/自定义角色回归通过。手动来源经过默认/临时匹配保留、置前去重、收藏和纯脚本复制验证；添加操作不生成日历或AI任务，后续显式复刻沿既有流程创建副本。

UI使用本地隔离接口夹具，320/390/768/1440px及中文390px交互通过：标题搜索、原视频/纯脚本、媒体失败保留脚本、添加响应丢失后幂等重试、分页、空结果、返回保留浏览位置、权限撤销、Esc隔离。截图位于MM的 `output/playwright/creative-library/`。此验证不代表生产数据库或实际账号验收。Windows网络类型专项测试的虚拟路径匹配已修正，专项类型检查通过。

既有 `test:creative-browser-ui` 在当前工作区及未修改的HEAD隔离副本均失败于初始“浏览无写请求”旧断言（自动续载被计入，1 !== 0）；该旧测试未修改，新功能独立UI回归通过。

上线顺序：Content → Kanban → MM。无需新增数据库表，无批量数据迁移、角色提权或模型调用；公共库接口及来源类型须先在上游就绪。上线后用真实主理人/获授权兼职主理人/普通商家账号验证角色入口和越权拒绝，再以同一来源在两个有权限的团队账号中核对添加、重新匹配保留及复刻。提交和推送以 Git 提交及远端回执为准；部署及生产状态尚未验收。

## 二次检查修复（2026-11-11，本地验证，未部署）

- 搜索、详情、添加统一读取 brandPlan 与 marketingSolution 的当前工作区，补齐仅保存在历史日历中的不喜欢标记，防止漏检。
- 添加在品牌事务锁内优先核对已有固定版本回执；同版本超时重试即使来源已更新/撤审/下架仍确认原提交，版本不一致则拒绝，不覆盖已导入证据。
- 同时缺少可用原视频和权威原脚本的记录禁止新增，详情禁用添加，服务端返回 library_source_empty（409），避免成功添加后在浏览中消失。
- 新增历史屏蔽、提交后来源变化重试、版本不一致、空来源及详情新屏蔽状态的回归。
