import { randomUUID } from 'node:crypto'
import { TextOutputLimitError } from './global-text/transport'

// Internal error boundary: never serialize an exception, provider body or model text.
export function internalLLMFailure(error: unknown) {
  const requestId = randomUUID()
  if (error instanceof TextOutputLimitError) {
    const d = error.diagnostics
    const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 100_000_000 ? n : null
    const identifier = (s: unknown) => typeof s === 'string' && /^[a-z0-9_.:-]{1,200}$/i.test(s) ? s : null
    const commit = process.env.RENDER_GIT_COMMIT || ''
    const evidence = (error as TextOutputLimitError & { usageEvidence?: { providerReference?: unknown } }).usageEvidence
    return {
      error: 'Text provider output token limit reached', code: 'MODEL_OUTPUT_LIMIT',
      diagnostics: {
        requestId, providerReference: identifier(evidence?.providerReference),
        gatewayCommit: /^[a-f0-9]{7,40}$/i.test(commit) ? commit : null,
        finishReason: 'length', maxTokens: count(d.maxTokens),
        completionTokens: count(d.completionTokens), reasoningTokens: count(d.reasoningTokens),
        contentChars: count(d.contentChars),
        reasoningEffort: ['low', 'high', 'max'].includes(d.reasoningEffort) ? d.reasoningEffort : 'unspecified',
      },
    }
  }
  const timedOut = error instanceof Error && (error.name === 'TimeoutError' || /timeout/i.test(error.message))
  const evidence=error as {textFailureKind?:unknown;providerHttpStatus?:unknown}
  const kind=['provider_http','provider_transport','provider_protocol'].includes(String(evidence?.textFailureKind))?String(evidence.textFailureKind):undefined
  const status=typeof evidence?.providerHttpStatus==='number'&&Number.isInteger(evidence.providerHttpStatus)&&evidence.providerHttpStatus>=400&&evidence.providerHttpStatus<=599?evidence.providerHttpStatus:undefined
  return {
    error: timedOut ? 'LLM generation timed out' : 'LLM generation failed',
    code: timedOut ? 'LLM_TIMEOUT' : 'LLM_GENERATION_FAILED', timedOut,
    diagnostics: { requestId,...(kind?{failureKind:kind}:{}),...(kind==='provider_http'&&status?{providerHttpStatus:status}:{}) },
  }
}
