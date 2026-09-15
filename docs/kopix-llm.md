# Kopix 文本模型

## 配置

代码部署后，在 `/admin` → AI 模型配置 → 新增大模型连接配置选择 **Kopix**。

| 字段 | 值 |
| --- | --- |
| 显示名称 | Kopix GLM-5.3 |
| Provider | kopix |
| Model Name | glm-5.3 |
| API Base URL | https://www.kopix.ai/v1 |
| API Key | 在后台输入有该模型权限的密钥 |
| 启用 / 默认 | 均关闭 |
| 优先级 | 0 |
| 任务标签 / 内容生成类型 / 备用链 | 均留空 |

保存时会真实调用模型验证连接，即使记录为禁用状态也必须验证通过。Kopix 验证请求预留 1024 个输出 token（含推理），45 秒超时。验证失败不创建记录；错误中的模型无权限需要在供应商侧处理。

密钥存入现有 LLMConfig 配置，经管理 API 脱敏回显和审计；不要写入源码或环境变量。禁用记录不参与任务及备用路由。启用和分配任务应另行操作。

## 验证

```powershell
node --experimental-strip-types scripts/test-kopix-llm.mts
npm run test:llm-routing-policy
npm run typecheck
```

测试脚本使用模拟请求和数据库查询，不调用真实模型，不修改数据库。

2026-09-15 已通过修改后的调用代码实测：保存连接验证、业务 JSON 输出、多轮上下文。原生 `response_format` 未启用；工具调用仅接入现有兼容入口，供应商工具能力尚未实测。

本地代码验证不代表生产部署或后台记录已保存；当前交付不切换现有供应商。
