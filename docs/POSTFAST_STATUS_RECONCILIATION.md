# PostFast 发布状态核对

## 运行规则

- Render 定时任务每5分钟调用 `POST /api/cron/postfast-sync-all`，推荐 cron 表达式为 `*/5 * * * *`。每次先处理持久化大视频发布任务；完整账号、帖子和分析同步按品牌最多每日执行一次。
- 发布内容页进入品牌时额外执行一次 `POST /api/brands/:id/drafts/sync-statuses`。
- 核对范围为本地 `scheduled`、`publishing`，供应商范围为 `scheduled`、`published`、`failed`。
- platformPostId 精确匹配优先。旧记录使用账号、NFKC/零宽字符标准化后的完整文案及两分钟时间窗口。
- 等价重复供应商记录只有在最终状态一致时才合并；冲突结果和供应商读取不完整不会写数据库。
- 排期或发布锁超过30分钟仍无可靠结果时，记录为 `failed` 和 `POSTFAST_RESULT_UNKNOWN`。用户必须先确认平台未发布才能重排。

## 历史修复

默认命令只读：

```bash
npm run postfast:repair-statuses:dry-run
```

核对逐品牌输出和最终汇总后显式执行：

```bash
npm run postfast:repair-statuses
```

可使用 `-- --brand <brand-id>` 限定单个品牌。脚本使用状态条件更新并写审计日志，可以安全重复运行。

## 上线检查

1. 先应用 Prisma migration，再部署应用。
2. 执行全量 dry-run，供应商错误数必须为0。
3. 执行 apply，再连续执行两次 dry-run；第二次不得重复产生同一状态更新。
4. 验证“发布失败”和“发布中”页签计数，并抽查 `12Eat 唐人街外卖`、`Super Rola`。
