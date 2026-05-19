# AMC Kanban Skill

> 本 Skill 面向 AMC Kanban 的任务、品牌配置、Lark 云盘与社媒发布工作流。

## 目标

当 Agent 需要把工作发到看板、配置品牌、上传素材到 Lark 云盘、或者把内容发布到 PostFast 时，必须优先使用 AMC Kanban 的 MCP 工具或 REST API，而不是在本地排队等待人工同步。

## 必做流程

1. 先获取或创建品牌。
2. 立即写入品牌配置。
3. 如品牌已配置 Lark App ID / Secret，先创建 Lark 工作区文件夹，再上传素材。
4. 需要发布时，先上传素材，再调用 PostFast 发布工具。
5. 所有可追踪工作都要同步到看板任务。

## 安装说明

在支持插件管理器的环境中，使用：

```bash
npm plugins install git-plugin-amc
```

## 看板配置

### 获取品牌

```http
GET /api/agent/brand-config
Authorization: Bearer <AGENT_API_KEY>
```

### 创建品牌

```http
POST /api/agent/brand-config
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "name": "品牌名称",
  "location": "城市, 国家",
  "timezone": "Asia/Singapore"
}
```

### 更新品牌配置

```http
PATCH /api/agent/brand-config
Authorization: Bearer <AGENT_API_KEY>
Content-Type: application/json

{
  "brandId": "<BRAND_ID>",
  "name": "品牌名称",
  "description": "品牌介绍",
  "location": "城市, 国家",
  "timezone": "Asia/Singapore",
  "website": "https://...",
  "phone": "+1 xxx-xxxx",
  "address": "完整地址",
  "postfastApiKey": "<POSTFAST_KEY>",
  "googlePlaceId": "<GOOGLE_PLACE_ID>",
  "googleApiKey": "<GOOGLE_API_KEY>",
  "larkAppId": "<LARK_APP_ID>",
  "larkAppSecret": "<LARK_APP_SECRET>",
  "larkParentFolderToken": "<LARK_PARENT_FOLDER_TOKEN>",
  "larkDriveFolderId": "<LARK_DRIVE_FOLDER_ID>",
  "larkBotWebhook": "<LARK_BOT_WEBHOOK_URL>",
  "larkOwnerId": "<LARK_OWNER_ID>"
}
```

## Lark 云盘工作流

1. 如果品牌还没有 `larkDriveFolderId`，先调用 `lark_create_workspace`。
2. 取得 `folderToken` 后，回写到品牌配置。
3. 上传素材时使用 `lark_upload_file`。
4. 上传成功后，把文件同步进看板素材库。

### 创建工作区

```json
{ "brandId": "<BRAND_ID>", "parentFolderToken": "<可选>" }
```

### 上传文件

```json
{
  "brandId": "<BRAND_ID>",
  "filename": "banner.jpg",
  "mimeType": "image/jpeg",
  "fileBase64": "<BASE64>"
}
```

## 发布工作流

1. 先调用 `postfast_upload_media` 上传内容素材。
2. 再调用 `postfast_publish` 进行排期或发布。
3. 最后用 `update_task` 把任务状态改成 `done`，并在描述里写明发布结果。

## 任务纪律

- 任何可追踪工作都必须上板。
- 阻塞时切到 `pending`，并写清楚 `requiredInput`。
- 完成后切到 `done` 并保留结果摘要。
- 不要把任务停留在本地队列里等待“后续同步”。
