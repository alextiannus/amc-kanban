# AI Marketing Crew (AMC) MCP APIs List

This document lists all the MCP tools registered in `src/lib/partner/mcp/server.ts`. These APIs are exposed through Personal MCP so AI clients can operate only as the connected user and only within that user's permissions.

---

## Authentication & Authorization Model (Auth V2)

All MCP tools execute within the context of an authenticated `AuthPrincipal`.
- **Personal Authorization**: the bearer token resolves directly to the user who generated it.
- **Single Permission Model**: MCP, REST and web UI share the same user roles, Capability checks and Crew brand scope.
- **No Impersonation**: callers must not send `x-agent-id` or try to act as another user.

---

## 1. Brand Profile & Configurations

### `get_brand_config`
*   **Description**: Get brand config and linked social accounts for brands this user can access.
*   **Arguments**:
    *   `brandId` (string, optional): Specific brand ID. Omit to list all linked brands.
*   **Response**: Safe brand details with configured status indicators, or list of linked brands.

### `get_brand_profile_markdown`
*   **Description**: Read brand profile markdown for AI pre-read context. Contains brand basics, positioning, multi-store structure, and social platform config.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `refresh` (boolean, optional): When true, regenerate the auto snapshot section before reading.

### `refresh_brand_profile_markdown`
*   **Description**: Regenerate brand profile markdown auto section from latest system data while preserving manual section.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.

### `update_brand_profile_markdown`
*   **Description**: Write full brand context markdown for this brand. Use this for long-form brand context.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `markdown` (string, required): Full markdown content to persist as brand profile context.

### `update_brand_config`
*   **Description**: Create or update brand profile and integration credentials. Write interview results and brand description here.
*   **Arguments**:
    *   `brandId` (string, optional): Brand ID to update. Omit only when creating a new brand.
    *   `name` (string, optional)
    *   `description` (string, optional): Full brand intro ≥200 chars. Synthesize all interview content + AI understanding. Markdown supported. Shown on brand dashboard.
    *   `location` (string, optional): City, Country
    *   `timezone` (string, optional): IANA timezone e.g. Asia/Singapore
    *   `website`, `phone`, `address` (string, optional)
    *   `postfastApiKey`, `googlePlaceId`, `googleApiKey` (string, optional)

### `get_brand_subscription`
*   **Description**: Get brand subscription details and included services.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.

---

## 2. Brand Planning & Calendar

### `get_brand_marketing_plan`
*   **Description**: Read the current research report, merchant interview, rolling marketing plan, and publishing calendar.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.

### `generate_brand_research_report`
*   **Description**: Generate or refresh the research report used as the baseline for planning.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.

### `save_brand_merchant_interview`
*   **Description**: Save principal or merchant interview notes before plan generation.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `rawNotes` (string, required)
    *   `summary` (string, optional)
    *   `answers` (array, optional): Q&A pairs.

### `generate_brand_marketing_plan`
*   **Description**: Generate the rolling marketing plan from latest research and merchant context.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.

### `generate_brand_publishing_calendar`
*   **Description**: Generate one month of publishing calendar from the current marketing plan.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `month` (string, optional): YYYY-MM.
    *   `publishingFreqOverride` (object, optional)

### `create_content_drafts_from_calendar`
*   **Description**: Create publish-ready content drafts from existing calendar items. Each platform is generated and written independently.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `month` (string, required): YYYY-MM.
    *   `limit` (integer, optional)
    *   `assetIds` (array, optional)

### `run_brand_planning_workflow`
*   **Description**: Run the full flow: verify access, optionally refresh research, generate marketing plan, generate publishing calendar, and optionally create content drafts.
*   **Arguments**:
    *   `brandId` (string, required): Brand ID inside this user's permission scope.
    *   `month` (string, optional): YYYY-MM.
    *   `refreshResearch` (boolean, optional)
    *   `createDrafts` (boolean, optional)
    *   `maxDrafts` (integer, optional)
    *   `assetIds` (array, optional)

---

## 3. User Profile & Self-Learning

### `get_agent_profile`
*   **Description**: Get the connected user's profile from AI Marketing Crew (excluding secrets).
*   **Arguments**: None

### `update_agent_profile`
*   **Description**: Update user-facing assistant profile nickname, avatar, introduction, themeColor, workflow, or insights.
*   **Arguments**:
    *   `nickname` (string, optional)
    *   `avatar` (string, optional): Public URL or base64 data URI (data:image/png;base64,...).
    *   `introduction` (string, optional)
    *   `workflow` (string, optional)
    *   `themeColor` (string, optional): HEX color e.g. #6366f1
    *   `insights` (string, optional)

### `save_agent_insights`
*   **Description**: Save connected-user AI working insights.
*   **Arguments**:
    *   `insights` (string, required): The markdown content of the self-learning insights.

---

## 4. Kanban Tasks & Workflow

### `list_tasks`
*   **Description**: List Kanban work units. Filter by brandId, status, or tasks assigned to this user.
*   **Arguments**:
    *   `brandId` (string, optional)
    *   `status` (enum: `['todo', 'in_progress', 'pending', 'done', 'archived', 'void']`, optional)
    *   `assignedToMe` (boolean, optional)
    *   `limit` (integer, optional, default: 20)

### `create_task`
*   **Description**: Create a new Kanban work unit to log work items, content drafts, or action items.
*   **Arguments**:
    *   `title` (string, required): Concise, action-oriented task title.
    *   `description` (string, optional): Details, context, or content draft.
    *   `status` (enum: `['todo', 'in_progress', 'pending', 'void']`, optional, default: `'todo'`)
    *   `priority` (enum: `['low', 'medium', 'high', 'urgent']`, optional, default: `'medium'`)
    *   `weight` (integer, optional): 1 = light, 3 = normal, 5 = heavy.
    *   `requiredInput` (string, optional): What human input is needed when status is pending.
    *   `deadline` (string, optional): ISO 8601 deadline.
    *   `brandId` (string, optional)

### `create_tasks`
*   **Description**: Batch create Kanban tasks.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `tasks` (array of task objects, required):
        *   `title` (string, required)
        *   `description`, `requiredInput`, `deadline`, `type` (string, optional)
        *   `status` (enum, optional), `priority` (enum, optional), `weight` (integer, optional)
        *   `attachments` (array of strings, optional)

### `create_require_input_task`
*   **Description**: Create a task on Kanban that requires human input or review.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `title` (string, required)
    *   `description` (string, required)
    *   `priority` (enum, optional, default: `'medium'`)
    *   `attachments` (array of strings, optional)

### `update_task`
*   **Description**: Update an existing work unit — status, description, title, or priority.
*   **Arguments**:
    *   `taskId` (string, required)
    *   `title`, `description` (string, optional)
    *   `status` (enum, optional), `priority` (enum, optional)
    *   `requiredInput` (string, nullable, optional)
    *   `deadline` (string, nullable, optional)
    *   `brandId` (string, nullable, optional)

### `board_delete_task`
*   **Description**: Delete a work unit task assigned to this user.
*   **Arguments**:
    *   `taskId` (string, required)
*   **Aliases**:
    *   `delete_task` (Compatibility alias)

---

## 5. Social Account Connections & Management

### `update_accounts`
*   **Description**: Add or update a social media account for a brand.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `platformId` (enum: `['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube', 'google', 'x', 'twitter', 'yelp', 'linkedin', 'pinterest', 'weibo', 'wechat', 'snapchat', 'tripadvisor']`, required)
    *   `handle` (string, required)
    *   `displayName`, `profileUrl`, `loginUsername`, `loginPassword` (string, optional)

### `board_list_social_accounts`
*   **Description**: List all connected social accounts for this brand via the board backend.
*   **Arguments**:
    *   `brandId` (string, required)
*   **Aliases**:
    *   `list_accounts` (Compatibility alias)
    *   `postfast_list_accounts` (Deprecated alias)

### `board_generate_account_connect_link`
*   **Description**: Generate a secure account-connect URL through board backend.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `label` (string, optional)
    *   `redirectUrl` (string, optional)
*   **Aliases**:
    *   `connect_account` (Compatibility alias)
    *   `postfast_generate_connect_link` (Deprecated alias)

### `fetch_public_social_profile`
*   **Description**: Fetch public social media profile stats (followers, posts, engagement).
*   **Arguments**:
    *   `platform` (enum: `['instagram', 'facebook']`, required)
    *   `handle` (string, required)

---

## 5. Content Drafts & Planning

### `board_list_drafts`
*   **Description**: List content drafts for a brand. Use status filters to find pending, scheduled, failed, or draft items.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `status` (string, optional): draft, pending_review, scheduled, published, failed, etc.
    *   `q` (string, optional): Search caption or exact hashtag.
    *   `limit` (integer, optional, default: 50)

### `board_save_draft`
*   **Description**: Create or update a brand content draft. (Do not set `scheduledAt` directly; use scheduling recommendation tool).
*   **Arguments**:
    *   `brandId` (string, required)
    *   `draftId` (string, optional): Pass to update. Omit to create.
    *   `caption` (string, optional)
    *   `hashtags` (array of strings, optional)
    *   `accountId` (string, optional)
    *   `mediaUrls` (array of strings, optional)
    *   `assetIds` (array of strings, optional)
    *   `agentNote` (string, optional)
    *   `captionLang` (string, optional, default: `'en'`)
    *   `creativeHooks` (string, optional)

### `board_get_draft`
*   **Description**: Read the details of a single content draft by its ID.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `draftId` (string, required)

### `board_submit_draft`
*   **Description**: Submit a saved draft. Auto-pilot brands publish/schedule directly; boss-approval brands create a pending review ActionItem.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `draftId` (string, required)
    *   `note` (string, optional)

### `board_delete_draft`
*   **Description**: Delete a content draft from the database. If scheduled, cancels the scheduling on PostFast first.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `draftId` (string, required)

### `board_get_schedule_recommendation`
*   **Description**: Get the recommended publish time for a brand on a given platform. MUST be called before `board_submit_draft` when scheduling content.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `platform` (string, nullable, optional): Null = cross-platform aggregate.
    *   `numberOfPosts` (integer, optional, default: 1)
    *   `urgency` (enum: `['normal', 'urgent']`, optional, default: `'normal'`)

---

## 6. Content Publishing & History

### `board_publish_content`
*   **Description**: Publish or schedule content through board backend using stored brand config.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `platform` (enum: `['instagram', 'tiktok', 'xiaohongshu', 'facebook', 'youtube', 'x', 'linkedin', 'threads', 'bluesky', 'pinterest', 'snapchat', 'telegram', 'google']`, required)
    *   `caption` (string, required)
    *   `mediaStorageKeys` (array of strings, optional)
    *   `mediaUrls` (array of strings, optional)
    *   `hashtags` (array of strings, optional)
    *   `scheduledAt` (string, optional): ISO 8601 UTC datetime
    *   `accountId` (string, optional)
*   **Aliases**:
    *   `publish` (Active alias)
    *   `postfast_publish` (Deprecated alias)

### `board_list_published_content`
*   **Description**: List scheduled/published content for this brand via the board backend.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `status` (enum: `['scheduled', 'published', 'failed', 'draft']`, optional)
    *   `platform` (string, optional)
    *   `limit` (integer, optional, default: 20)
*   **Aliases**:
    *   `postfast_list_posts` (Deprecated alias)

### `board_delete_scheduled_content`
*   **Description**: Delete a scheduled content item via the board backend.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `postId` (string, required)
*   **Aliases**:
    *   `postfast_delete_post` (Deprecated alias)

---

## 7. Media Upload & Asset Library

### `board_upload_media`
*   **Description**: Upload media through board backend and return storageKey for publish.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `filename` (string, required)
    *   `mimeType` (string, required)
    *   `fileBase64` (string, required): Base64-encoded content (no prefix)
    *   `sizeBytes` (integer, optional)
*   **Aliases**:
    *   `upload_asset` (Compatibility alias)
    *   `postfast_upload_media` (Deprecated alias)

### `board_list_assets`
*   **Description**: List brand media assets from the board asset library.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `q` (string, optional)
    *   `folder` (string, optional): Maps to folder/category
    *   `readyOnly` (boolean, optional)
    *   `limit` (integer, optional, default: 50)
*   **Aliases**:
    *   `list_brand_assets` (Compatibility alias)

### `board_upload_asset`
*   **Description**: Upload an asset into the board asset library by providing base64 data OR a direct image URL.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `filename` (string, required)
    *   `mimeType` (string, optional)
    *   `fileBase64` (string, optional)
    *   `imageUrl` (string, optional)
    *   `folder` (string, optional)
    *   `aiTags` (array of strings, optional)
    *   `aiCaption` (string, optional)

### `board_get_asset`
*   **Description**: Retrieve metadata and URL of a specific media asset from the brand's asset library by asset ID.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `assetId` (string, required)

### `board_update_asset`
*   **Description**: Edit/update properties of a brand media asset, such as its name, category (folder), caption, tags, or ready status.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `assetId` (string, required)
    *   `filename` (string, optional)
    *   `folder` (string, optional)
    *   `aiCaption` (string, optional)
    *   `aiTags` (array of strings, optional)
    *   `aiReady` (boolean, optional)

### `board_delete_asset`
*   **Description**: Delete a brand media asset completely from the database and disk storage.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `assetId` (string, required)

---

## 8. Customer Reviews & Care

### `board_reply_review`
*   **Description**: Reply to a review through board backend using stored brand config.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `platform` (enum: `['google', 'yelp', 'instagram', 'tiktok', 'xiaohongshu', 'dianping', 'meituan']`, required)
    *   `reviewId` (string, required)
    *   `replyText` (string, required)
*   **Aliases**:
    *   `reply_review` (Compatibility alias)
    *   `postfast_reply_review` (Deprecated alias)

### `google_get_reviews`
*   **Description**: Fetch the latest Google Business reviews for a brand. Returns reviewer, rating, comment, and existing reply.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `limit` (integer, optional, default: 10)
*   **Aliases**:
    *   `get_reviews` (Compatibility alias)

### `google_reply_review`
*   **Description**: Post a reply to a Google Business review. Uses direct Google API if OAuth is configured, otherwise PostFast.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `reviewId` (string, required)
    *   `replyText` (string, required)

### `get_brand_reviews`
*   **Description**: Fetch the latest Google Maps / GBP reviews for a brand.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `limit` (integer, optional, default: 10)

### `google_get_place_info`
*   **Description**: Get Google Place profile details for a brand location.
*   **Arguments**:
    *   `placeId` (string, required)

---

## 9. Action Execution & Notifications

### `post_action_item`
*   **Description**: Submit an action item (alert or content pending review) to the brand dashboard.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `type` (enum: `['sentiment_alert', 'content_draft', 'content_approval', 'competitor_alert', 'performance_update']`, required)
    *   `priority` (enum: `['low', 'medium', 'high', 'urgent']`, optional, default: `'medium'`)
    *   `title` (string, required)
    *   `description` (string, required)
    *   `platform` (string, optional)

### `execute_brand_action`
*   **Description**: Execute a unified marketing or customer care action for a brand (replies, posts, notifications).
*   **Arguments**:
    *   `brandId` (string, required)
    *   `actionType` (enum: `['reply_review', 'domestic_reply_review', 'publish_post']`, required)
    *   `platform`, `reviewId`, `replyText` (string, optional)
    *   `caption` (string, optional)
    *   `mediaUrls` (array of strings, optional)
    *   `hashtags` (array of strings, optional)



---

## 10. Research, Topics & Documents

### `board_list_topics`
*   **Description**: List brand Hot Topics markdown documents.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `q` (string, optional)
    *   `tag` (string, optional)
    *   `status` (enum: `['active', 'archived', 'all']`, optional, default: `'active'`)
    *   `limit` (integer, optional, default: 50)

### `board_get_topic`
*   **Description**: Read one Hot Topics markdown document by ID.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `topicId` (string, required)

### `board_save_topic`
*   **Description**: Create or update a Hot Topics markdown research document for a brand.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `topicId` (string, optional): Pass to update. Omit to create.
    *   `title` (string, required)
    *   `markdown` (string, required)
    *   `summary`, `sourceUrl` (string, optional)
    *   `tags` (array of strings, optional)

### `board_archive_topic`
*   **Description**: Archive a Hot Topics research document (soft delete).
*   **Arguments**:
    *   `brandId` (string, required)
    *   `topicId` (string, required)

### `save_local_document`
*   **Description**: Save a marketing report or strategy document locally as a Markdown file.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `filename` (string, required)
    *   `docType` (enum: `['weekly_report', 'monthly_report', 'strategy_plan', 'daily_memory', 'other']`, required)
    *   `content` (string, required)

### `sync_to_kanban`
*   **Description**: Synchronize a local document to the Kanban board as a completed task.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `docId` (string, required)
    *   `summary` (string, optional)

### `write_daily_memory`
*   **Description**: Save daily memory markdown file for a brand.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `date` (string, required): YYYY-MM-DD format
    *   `content` (string, required)

### `read_daily_memory`
*   **Description**: Read daily memory markdown files for a brand.
*   **Arguments**:
    *   `brandId` (string, required)
    *   `days` (integer, optional): Number of recent days
    *   `date` (string, optional): Specific YYYY-MM-DD date

---

## 11. Platform Analytics & Benchmarks

### `get_brand_analytics`
*   **Description**: Get brand historical analytics (likes, comments, engagement, time-series).
*   **Arguments**:
    *   `brandId` (string, required)
    *   `from`, `to`, `platform` (string, optional)

### `get_social_insights`
*   **Description**: Get live brand social insights (sentiment, keywords, conversions, trends, top posts).
*   **Arguments**:
    *   `brandId` (string, required)
    *   `from`, `to`, `platform` (string, optional)

### `get_platform_benchmarks`
*   **Description**: Get platform-level benchmarks by category and location.
*   **Arguments**:
    *   `category` (string, required): e.g. chinese_restaurant
    *   `location` (string, required): e.g. Singapore
    *   `platform` (string, optional)

---

## 12. FAQ & School Management

### `list_faqs`
*   **Description**: List all FAQ / Q&A items in the AMC Learning Center.
*   **Arguments**: None

### `add_faq`
*   **Description**: Add a new Q&A item to the AMC Learning Center FAQ list.
*   **Arguments**:
    *   `category` (enum: `['accounts', 'posts', 'influencers', 'billing', 'reports']`, required)
    *   `q` (string, required)
    *   `a` (string, required)
    *   `tag` (string, required)

### `delete_faq`
*   **Description**: Delete a Q&A item from the AMC Learning Center FAQ list.
*   **Arguments**:
    *   `id` (string, required)

### `list_school_items`
*   **Description**: List all AMC School items (courses, cases, and calendar events).
*   **Arguments**: None

### `add_school_item`
*   **Description**: Add a new Course, Case, Calendar Event, or Article to the AMC School.
*   **Arguments**:
    *   `type` (enum: `['COURSE', 'CASE', 'CALENDAR', 'ARTICLE']`, required)
    *   `title`, `desc`, `duration`, `date`, `event`, `tip`, `markdown` (string, optional)
    *   `level` (enum: `['entry', 'advanced']`, optional)

### `delete_school_item`
*   **Description**: Delete a School item (Course, Case, or Calendar Event) by its ID.
*   **Arguments**:
    *   `id` (string, required)

---

## 13. Copywriting & Template Base

### `submit_knowledge_template`
*   **Description**: Submit a copywriting template, content idea, video script blueprint, or prompt rule to the AMC Knowledge Base.
*   **Arguments**:
    *   `industry` (enum: `['fb', 'fitness', 'renovation', 'winery', 'general']`, required)
    *   `platform` (string, required)
    *   `template`, `idea`, `videoScript`, `prompt` (string, optional)
