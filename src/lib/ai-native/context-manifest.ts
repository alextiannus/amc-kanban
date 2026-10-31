import { createHash } from 'node:crypto'

type JsonRecord = Record<string, unknown>
const object = (value: unknown): JsonRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
const fingerprint = (value: unknown) => {
  const serialized = JSON.stringify(value) ?? 'null'
  const bytes = Buffer.byteLength(serialized)
  return { sha256: createHash('sha256').update(serialized).digest('hex'), bytes, estimatedTokens: Math.ceil(bytes / 4) }
}
// Only technical resource identifiers are retained, never arbitrary result strings.
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_./:-]{1,200}$/.test(value) ? value : null
const version = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null

/** Inspect the final transport input, after Core truncation and provider tool mapping.
 * A manifest proves inclusion, not business correctness or provider token usage.
 * Message/tool hashes cover the complete input; projections below are informational.
 */
export function buildContextManifest(messages: readonly unknown[], tools: readonly unknown[]) {
  const skillResources: Array<{ origin: 'history_read'|'review_input'; messageIndex: number; callId: string | null; id: string | null; resource: string | null; version: string | null; skillVersion: string | null; included: boolean; content: ReturnType<typeof fingerprint> | null }> = []
  const directories: Array<{ messageIndex: number; entries: number; containsBody: boolean }> = []
  let preloadedPlanningSkills = 0
  for (const [messageIndex, raw] of messages.entries()) {
    const message = object(raw)
    if (typeof message?.content !== 'string') continue
    let data: JsonRecord | null
    try { data = object(JSON.parse(message.content)) } catch { continue }
    if (!data) continue
    for(const value of Array.isArray(data.rules)?data.rules:[]){const rule=object(value);if(typeof rule?.text==='string')skillResources.push({origin:'review_input',messageIndex,callId:null,id:identifier(rule.id),resource:identifier(rule.resource),version:version(rule.version),skillVersion:version(rule.skillVersion),included:true,content:fingerprint(rule.text)})}
    if (Array.isArray(data.skills)) directories.push({ messageIndex, entries: data.skills.length, containsBody: data.skills.some(item => typeof object(item)?.text === 'string' || typeof object(item)?.content === 'string') })
    for (const rawCall of Array.isArray(data.calls) ? data.calls : []) {
      const call = object(rawCall), result = object(call?.result), input = object(call?.input)
      if (call?.capability === 'assistant.skills.read' && call.status === 'succeeded') {
        const included = call.resultOmitted !== true && typeof result?.text === 'string'
        skillResources.push({ origin:'history_read', messageIndex, callId: identifier(call.id), id: identifier(input?.id), resource: identifier(input?.resource), version: version(result?.version), skillVersion: version(result?.skillVersion), included, content: included ? fingerprint(result!.text) : null })
      }
      if (typeof object(object(result?.planningContext)?.skill)?.content === 'string') preloadedPlanningSkills++
    }
  }
  return {
    schemaVersion: 1,
    tokenEstimateMethod: 'serialized_utf8_bytes_divided_by_4_not_provider_usage',
    messages: messages.map((message, index) => ({ index, ...fingerprint(message) })),
    tools: tools.map((tool, index) => ({ index, ...fingerprint(tool) })),
    input: fingerprint({ messages, tools }),
    directories, skillResources, preloadedPlanningSkills,
  }
}
