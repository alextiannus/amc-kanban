export type OpenclawWebhookEventType =
  | 'agent.config.updated'
  | 'agent.health.ping'
  | 'agent.message.received'
  | 'agent.message.sent'
  | 'agent.connected'

export interface OpenclawWebhookEvent {
  type: OpenclawWebhookEventType | string
  timestamp?: string
  payload?: Record<string, unknown>
}

function normalizeOptionalUrl(raw?: string | null): string | null | '__INVALID__' {
  if (raw === undefined || raw === null) return null
  const value = raw.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return '__INVALID__'
    return parsed.toString()
  } catch {
    return '__INVALID__'
  }
}

export function normalizeOpenclawAgentConfig(input: {
  chatLink?: string | null
  driveFolder?: string | null
}) {
  const chatLink = normalizeOptionalUrl(input.chatLink)
  if (chatLink === '__INVALID__') {
    return { ok: false as const, error: 'chatLink must be a valid http/https URL' }
  }

  const driveFolder = normalizeOptionalUrl(input.driveFolder)
  if (driveFolder === '__INVALID__') {
    return { ok: false as const, error: 'driveFolder must be a valid http/https URL' }
  }

  return {
    ok: true as const,
    data: {
      chatLink,
      driveFolder,
      agentProvider: 'OPENCLAW' as const,
    },
  }
}

export function buildOpenclawConnectionProfile(input: {
  origin: string
  agentApiKey: string
  agentId: string
  chatLink?: string | null
  driveFolder?: string | null
}) {
  const base = input.origin.replace(/\/$/, '')
  const mcpUrl = `${base}/api/mcp`
  const webhookUrl = `${base}/api/integrations/openclaw/webhook`
  const connectionApiUrl = `${base}/api/integrations/openclaw/connection`

  return {
    provider: 'OPENCLAW' as const,
    agentId: input.agentId,
    agentProfile: {
      chatLink: input.chatLink ?? null,
      driveFolder: input.driveFolder ?? null,
    },
    endpoints: {
      mcpUrl,
      webhookUrl,
      connectionApiUrl,
    },
    auth: {
      type: 'bearer' as const,
      headerName: 'Authorization',
      headerValueExample: `Bearer ${input.agentApiKey}`,
      xApiKeyHeaderExample: input.agentApiKey,
    },
    examples: {
      mcpServerConfig: {
        amcKanban: {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${input.agentApiKey}`,
          },
        },
      },
      webhookPostExample: {
        url: webhookUrl,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.agentApiKey}`,
          'Content-Type': 'application/json',
        },
        body: {
          type: 'agent.health.ping',
          timestamp: new Date().toISOString(),
          payload: { source: 'openclaw' },
        },
      },
    },
  }
}

export function parseOpenclawWebhookBody(raw: unknown): OpenclawWebhookEvent {
  if (!raw || typeof raw !== 'object') {
    return { type: 'agent.health.ping', payload: {} }
  }

  const input = raw as Record<string, unknown>
  const type = typeof input.type === 'string' ? input.type : 'agent.health.ping'
  const timestamp = typeof input.timestamp === 'string' ? input.timestamp : undefined
  const payload = input.payload && typeof input.payload === 'object'
    ? (input.payload as Record<string, unknown>)
    : {}

  return { type, timestamp, payload }
}
