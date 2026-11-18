// Error output is constructed exclusively from constants, never provider text.
export function googlePlaceMcpResult(status: number, data: unknown) {
  if (status < 400) {
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  const knownStatuses = ['REQUEST_DENIED', 'INVALID_REQUEST', 'NOT_FOUND', 'ZERO_RESULTS', 'OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT', 'UNKNOWN_ERROR']
  const googleStatus = typeof body.googleStatus === 'string' && knownStatuses.includes(body.googleStatus) ? body.googleStatus : null
  let failureKind = 'UPSTREAM_FAILURE'
  let message = 'Google Places request failed; inspect authorized service diagnostics.'
  if (googleStatus === 'REQUEST_DENIED') {
    failureKind = 'REQUEST_DENIED'
    message = 'Google Places denied the request; verify the configured credential and access.'
    if (body.details === 'The provided API key is invalid.') {
      failureKind = 'INVALID_API_KEY'
      message = 'Google Places rejected the configured API key as invalid; verify it through authorized credential settings.'
    }
  } else if (body.error === 'Google Places API Key is not configured') {
    failureKind = 'KEY_NOT_CONFIGURED'
    message = 'Google Places API key is not configured.'
  } else if (status === 401 || status === 403) {
    failureKind = 'ACCESS_DENIED'
    message = 'AMC access denied for this request.'
  } else if (status === 400 || googleStatus === 'INVALID_REQUEST') {
    failureKind = 'INVALID_REQUEST'
    message = 'Google Places request parameters are invalid.'
  } else if (googleStatus === 'NOT_FOUND' || googleStatus === 'ZERO_RESULTS') {
    failureKind = 'PLACE_NOT_FOUND'
    message = 'Google Places returned no matching place.'
  } else if (googleStatus === 'OVER_QUERY_LIMIT' || googleStatus === 'OVER_DAILY_LIMIT') {
    failureKind = 'QUOTA_OR_BILLING_LIMIT'
    message = 'Google Places reported a usage or billing limit; review authorized service settings.'
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message, failureKind, googleStatus }) }], isError: true }
}
