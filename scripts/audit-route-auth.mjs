import fs from 'node:fs'
import path from 'node:path'

const apiRoot = path.resolve('src/app/api')
const routeFiles = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(fullPath)
    else if (entry.name === 'route.ts') routeFiles.push(fullPath)
  }
}

walk(apiRoot)

const publicMarkers = [
  '/api/auth/login/',
  '/api/auth/register/',
  '/api/auth/logout/',
  '/api/integrations/stripe/webhook/',
  '/api/public/',
  '/api/game/',
  '/api/meta/',
  '/api/mm/health/',
  '/api/invite/',
]
const authMarkers = [
  'authenticateRequest',
  'authenticateCurrentSession',
  'verifySessionToken',
  'getSession',
  'resolveSessionOrApiKey',
  'getAgentFromApiKey',
  'verifyUserApiKey',
  'requireAdminAgent',
  'CRON_SECRET',
  'MM_INTERNAL_SECRET',
  'stripe.webhooks.constructEvent',
]
const terminalMarkers = [
  'endpoint_retired',
  'is disabled',
]
const forwardingPatterns = [
  /import\s+\{[^}]+\}\s+from\s+['"][^'"]*\/route['"]/,
  /export\s+\{[^}]+\}\s+from\s+['"][^'"]*\/route['"]/,
]

const unresolved = []
for (const file of routeFiles) {
  const normalized = file.replaceAll(path.sep, '/')
  const source = fs.readFileSync(file, 'utf8')
  const isPublic = publicMarkers.some((marker) => normalized.includes(marker))
  const hasAuth = authMarkers.some((marker) => source.includes(marker))
  const isTerminal = terminalMarkers.some((marker) => source.includes(marker))
  const forwardsToAuditedRoute = forwardingPatterns.some((pattern) => pattern.test(source))
  if (!isPublic && !hasAuth && !isTerminal && !forwardsToAuditedRoute) {
    unresolved.push(path.relative(process.cwd(), file))
  }
}

console.log(JSON.stringify({
  routes: routeFiles.length,
  unresolvedCount: unresolved.length,
  unresolved,
}, null, 2))

if (process.argv.includes('--strict') && unresolved.length > 0) {
  process.exitCode = 1
}
