# Phase 2 Implementation Guide: MCP Tool Refactoring

## Current Status (Phase 1 Complete)

✅ **Done**: Unified API endpoints created at:
- `POST /api/brands/[id]/posts/publish` 
- `GET /api/brands/[id]/reviews`
- `POST /api/brands/[id]/reviews/reply`
- `POST /api/brands/[id]/assets/upload`
- `POST /api/brands/[id]/notifications`

✅ **Done**: Agent instructions updated to use business-oriented language

## Phase 2 Task: Update MCP Tools

### Approach: Add New Tool Aliases (Backward Compatible)

Instead of refactoring all existing tools, we can:

1. **Keep existing PostFast tools** for backward compatibility
2. **Add new unified tool aliases** that redirect to the new endpoints
3. **Mark old tools as deprecated** in documentation

### New Tools to Add to `src/lib/mcp/server.ts`

```typescript
// ── publish_post (UNIFIED - replaces postfast_publish)
server.tool(
  'publish_post',
  'Publish or schedule a social media post to any connected platform. Backend automatically selects the optimal publishing engine.',
  { /* same params as postfast_publish */ },
  async ({ brandId, platform, caption, ... }) => {
    const response = await fetch(`${KANBAN_BASE}/api/brands/${brandId}/posts/publish`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${agentApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, caption, ... })
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(await response.json()) }] }
  }
)

// ── get_reviews (UNIFIED - replaces google_get_reviews)
server.tool(
  'get_reviews',
  'Get all reviews from connected platforms (Google Business, Yelp, etc.)',
  { /* params */ },
  async ({ brandId, platform }) => {
    // Call GET /api/brands/[id]/reviews
  }
)

// ── reply_review (UNIFIED - replaces postfast_reply_review + google_reply_review)
server.tool(
  'reply_review',
  'Reply to any customer review. Backend handles platform detection and optimal reply engine.',
  { /* params */ },
  async ({ brandId, reviewId, replyText }) => {
    // Call POST /api/brands/[id]/reviews/reply
  }
)

// ── upload_asset (UNIFIED - replaces lark_upload_file + postfast_upload_media)
server.tool(
  'upload_asset',
  'Upload media or document to brand asset library. Backend stores in PostFast/Lark/local.',
  { /* params */ },
  async ({ brandId, filename, mimeType, fileBase64 }) => {
    // Call POST /api/brands/[id]/assets/upload
  }
)

// ── notify_owner (UNIFIED - replaces lark_notify)
server.tool(
  'notify_owner',
  'Send a notification to brand owner. Backend routes through Lark/email/SMS.',
  { /* params */ },
  async ({ brandId, title, message, actionUrl }) => {
    // Call POST /api/brands/[id]/notifications
  }
)

// ── list_accounts (UNIFIED - wrapper around get_brand_config)
server.tool(
  'list_accounts',
  'Get all social media accounts connected to a brand.',
  { brandId: z.string() },
  async ({ brandId }) => {
    // Already handled by GET /api/brands/[id] which includes accounts array
    // Just expose it as a dedicated tool for clarity
  }
)

// ── connect_account (UNIFIED - replaces postfast_generate_connect_link)
server.tool(
  'connect_account',
  'Generate a secure link for brand owner to connect new social accounts.',
  { /* params */ },
  async ({ brandId, redirectUrl }) => {
    // Can call postfastGenerateConnectLink or new unified endpoint
  }
)
```

### Implementation Steps

1. Open `src/lib/mcp/server.ts`
2. After the existing PostFast tools (around line 700), add the new unified tools
3. Each new tool should:
   - Call the corresponding unified API endpoint
   - Handle the response and format for MCP
   - Include error handling
4. Update `skills/amc-integrations.md` to document the new tools
5. Mark old tools as deprecated in their descriptions

### Code Pattern for Each Tool

```typescript
server.tool(
  'new_tool_name',
  'Description',
  { /* zod schema */ },
  async (input) => {
    const agent = await resolveAgent()
    if (!agent) return { content: [{ type: 'text' as const, text: 'Error: Invalid API key' }], isError: true }
    
    const link = await prisma.brandAgent.findFirst({ 
      where: { brandId: input.brandId, agentId: agent.id, active: true } 
    })
    if (!link) return { content: [{ type: 'text' as const, text: 'Error: Brand not linked' }], isError: true }

    // Call unified API endpoint
    const response = await fetch(
      `https://amc-kanban.immedi.ai/api/brands/${input.brandId}/path/to/endpoint`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${agentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ /* request payload */ })
      }
    )

    const data = await response.json()
    if (!response.ok) return { content: [{ type: 'text' as const, text: `Error: ${data.error}` }], isError: true }

    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)
```

### Testing After Implementation

1. Test each new tool in Claude Desktop with the MCP server
2. Verify responses match expected format
3. Test error cases (invalid brand, missing config, etc.)
4. Verify both old and new tools work (backward compatibility)

### Documentation Update

Update `skills/amc-integrations.md`:

```markdown
### ⚠️ Migration Notice

**Old Tool Names** (deprecated but still working):
- `postfast_publish` → Use `publish_post` instead
- `postfast_reply_review` → Use `reply_review` instead
- `lark_upload_file` → Use `upload_asset` instead
- `lark_notify` → Use `notify_owner` instead

**New Unified Tools** (recommended):
- `publish_post` — publish/schedule to any platform
- `get_reviews` — fetch reviews from all sources
- `reply_review` — reply to any review
- `upload_asset` — upload to any storage backend
- `notify_owner` — notify via any channel
```

### Benefits of This Approach

✅ Zero breaking changes — old tools still work
✅ Clear migration path for Agent developers
✅ Backend abstraction is transparent
✅ Can deprecate old tools gradually
✅ New Agents use unified API from day one

### Estimated Effort

- Implementation: 2-3 hours
- Testing: 1 hour
- Documentation: 1 hour
- **Total: 4-5 hours** (next session)

---

## Future Phases

**Phase 3**: Remove deprecated tools (after 3 months grace period)
**Phase 4**: Add more publishing backends (native platform APIs)
**Phase 5**: Add more storage backends for assets (S3, Azure, etc.)
