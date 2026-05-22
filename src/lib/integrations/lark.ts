/**
 * Lark (Feishu) Integration
 * - Drive: upload brand media assets to Lark Drive
 * - Messenger: send bot notifications to brand owner
 *
 * Brand owner configures larkAppId + larkAppSecret in Brand Settings.
 * AMC auto-refreshes the tenant_access_token using app credentials.
 */

export const LARK_BASE = process.env.LARK_API_BASE || 'https://open.feishu.cn/open-apis'
export const LARK_APP_DOMAIN = process.env.LARK_APP_DOMAIN || 'https://12eat-ai.sg.larksuite.com'


// ── Default parent folder (AI Workspaces root) ────────────────────────────
// https://12eat-ai.sg.larksuite.com/drive/folder/PbugfutjllCDM0dqMiIlN0orgZd
export const DEFAULT_LARK_PARENT_FOLDER = 'PbugfutjllCDM0dqMiIlN0orgZd'

// ── Create Brand Workspace Folder ──────────────────────────────────────────

export interface WorkspaceResult {
  success: boolean
  folderToken?: string      // token for Workspace_<brandName> subfolder
  folderUrl?: string        // deep-link to folder in Lark
  error?: string
}

/**
 * Creates `Workspace_<brandName>` inside the brand's configured parent folder.
 * All credentials are per-brand (appId, appSecret, parentFolderToken).
 * parentFolderToken defaults to the shared AI Workspaces root if not set.
 */
export async function createBrandWorkspace(input: {
  appId: string
  appSecret: string
  parentFolderToken?: string   // defaults to DEFAULT_LARK_PARENT_FOLDER
  brandName: string
}): Promise<WorkspaceResult> {
  const { appId, appSecret, brandName } = input
  const parentFolder = input.parentFolderToken || DEFAULT_LARK_PARENT_FOLDER

  if (!appId || !appSecret) {
    return { success: false, error: 'Brand Lark App ID and Secret are required to create a workspace' }
  }

  const token = await getLarkTenantToken(appId, appSecret)
  if (!token) return { success: false, error: 'Failed to obtain Lark access token — check App ID / Secret' }

  // Sanitise brand name for folder title
  const safeName = brandName.trim().replace(/[/\\:*?"<>|]/g, '_')
  const folderName = `Workspace_${safeName}`

  try {
    const res = await fetch(`${LARK_BASE}/drive/explorer/v2/folder/${parentFolder}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: folderName }),
    })

    const data = await res.json()
    if (data.code !== 0) {
      return { success: false, error: `Lark API error ${data.code}: ${data.msg}` }
    }

    const folderToken: string = data.data?.token
    if (!folderToken) return { success: false, error: 'Lark did not return a folder token' }

    return {
      success: true,
      folderToken,
      folderUrl: `${LARK_APP_DOMAIN}/drive/folder/${folderToken}`,
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ── Token Management ───────────────────────────────────────────────────────

interface LarkTokenCache {
  token: string
  expiresAt: number
}

// In-memory cache (per app — in production use Redis)
const tokenCache = new Map<string, LarkTokenCache>()

export async function getLarkTenantToken(appId: string, appSecret: string): Promise<string | null> {
  const cacheKey = `${appId}:${appSecret}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  try {
    const res = await fetch(`${LARK_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const data = await res.json()
    if (data.code !== 0) return null

    tokenCache.set(cacheKey, {
      token: data.tenant_access_token,
      expiresAt: Date.now() + data.expire * 1000,
    })
    return data.tenant_access_token
  } catch {
    return null
  }
}

// ── Drive: Upload File ─────────────────────────────────────────────────────

export interface LarkUploadResult {
  success: boolean
  fileToken?: string    // Lark file token — use as MediaAsset.url
  downloadUrl?: string
  error?: string
}

export async function uploadToLarkDrive(input: {
  appId: string
  appSecret: string
  folderId: string      // parent folder token
  filename: string
  mimeType: string
  fileBuffer: Buffer
}): Promise<LarkUploadResult> {
  const token = await getLarkTenantToken(input.appId, input.appSecret)
  if (!token) return { success: false, error: 'Failed to get Lark access token' }

  try {
    // Use Lark Drive upload API
    const formData = new FormData()
    formData.append('file_name', input.filename)
    formData.append('parent_type', 'explorer')
    formData.append('parent_node', input.folderId)
    formData.append('size', String(input.fileBuffer.length))
    formData.append('file', new Blob([new Uint8Array(input.fileBuffer)], { type: input.mimeType }), input.filename)

    const res = await fetch(`${LARK_BASE}/drive/v1/files/upload_all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })

    const data = await res.json()
    if (data.code !== 0) return { success: false, error: data.msg }

    const fileToken = data.data?.file_token
    return {
      success: true,
      fileToken,
      // Construct a stable download URL using file token
      downloadUrl: `${LARK_BASE}/drive/v1/medias/${fileToken}/download`,
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/**
 * Get a temporary download URL for a Lark Drive file token
 */
export async function getLarkFileUrl(fileToken: string, appId: string, appSecret: string): Promise<string | null> {
  const token = await getLarkTenantToken(appId, appSecret)
  if (!token) return null
  // Lark Drive download URL requires auth — return a proxied URL via AMC
  return `/api/integrations/lark/file/${fileToken}`
}

// ── Messenger: Send Bot Notification ──────────────────────────────────────

export interface LarkNotifyInput {
  webhookUrl?: string           // Custom bot webhook (simpler, no OAuth)
  ownerId?: string              // open_id for direct message (requires app bot)
  token?: string                // tenant_access_token for DM
  title: string
  content: string
  actionUrl?: string            // Deep link back to Kanban
}

/**
 * Send notification via Lark custom bot webhook (simpler, webhook URL configured by user)
 */
export async function sendLarkWebhookNotification(input: {
  webhookUrl: string
  title: string
  content: string
  actionUrl?: string
  urgent?: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const color = input.urgent ? 'red' : 'green'
    const body = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: input.title },
          template: color,
        },
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: input.content },
          },
          ...(input.actionUrl ? [{
            tag: 'action',
            actions: [{
              tag: 'button',
              text: { tag: 'plain_text', content: '前往处理 →' },
              type: 'primary',
              url: input.actionUrl,
            }],
          }] : []),
        ],
      },
    }

    const res = await fetch(input.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (data.code !== 0 && data.StatusCode !== 0) {
      return { success: false, error: data.msg ?? data.StatusMessage }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/**
 * Send a direct message to brand owner via Lark bot (requires app with messaging permissions)
 */
export async function sendLarkDirectMessage(input: {
  appId: string
  appSecret: string
  ownerId: string
  title: string
  content: string
  actionUrl?: string
  urgent?: boolean
}): Promise<{ success: boolean; error?: string }> {
  const token = await getLarkTenantToken(input.appId, input.appSecret)
  if (!token) return { success: false, error: 'Failed to get Lark token' }

  return sendLarkWebhookNotification({
    webhookUrl: `${LARK_BASE}/im/v1/messages?receive_id_type=open_id`,
    title: input.title,
    content: input.content,
    actionUrl: input.actionUrl,
    urgent: input.urgent,
  })
}
