import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function walk(directory, predicate = () => true) {
  const results = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) results.push(...walk(fullPath, predicate))
    else if (predicate(fullPath)) results.push(fullPath)
  }
  return results
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function linesMatching(file, pattern) {
  return read(file)
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, lineNumber }) => `${rel(file)}:${lineNumber}: ${line.trim()}`)
}

const criticalFindings = []

const plaintextAgentKeyExposureFiles = [
  'src/app/api/agents/route.ts',
  'src/app/api/agents/[id]/route.ts',
  'src/app/api/subscription/route.ts',
  'src/components/AgentDetailPanel.tsx',
  'src/app/profile/principal/page.tsx',
].map((file) => path.join(root, file))

for (const file of plaintextAgentKeyExposureFiles) {
  if (!fs.existsSync(file)) continue
  criticalFindings.push(
    ...linesMatching(
      file,
      /\bapiKey\s*:\s*true\b|\bagent\.apiKey\b|\bselectedAgent\.apiKey\b|\bvalue=\{agent\.apiKey\}/,
    ),
  )
}

const staleAgentKeyDocs = [
  'docs/agent-skill-amc-kanban.md',
  'docs/AGENT_CONNECTIVITY.md',
  'docs/API_SERVICES.md',
].map((file) => path.join(root, file))

for (const file of staleAgentKeyDocs) {
  if (!fs.existsSync(file)) continue
  criticalFindings.push(
    ...linesMatching(file, /set in .*User\.apiKey|from .*User\.apiKey|Human Key \+ `x-agent-id` can be used/i),
  )
}

const routeFiles = walk(path.join(root, 'src/app/api'), (file) => file.endsWith('/route.ts'))
const legacyAuthRouteFiles = []
for (const file of routeFiles) {
  const source = read(file)
  if (/\bgetSession\(|\bgetAgentFromApiKey\(|\bextractApiKey\(/.test(source)) {
    legacyAuthRouteFiles.push(rel(file))
  }
}

const report = {
  criticalFindings,
  legacyAuthRouteCount: legacyAuthRouteFiles.length,
  legacyAuthRouteFiles,
  note:
    'Critical findings must stay at 0. legacyAuthRouteFiles is a migration backlog: convert these routes to authenticateRequest + requireCapability over time.',
}

console.log(JSON.stringify(report, null, 2))

if (process.argv.includes('--strict') && criticalFindings.length > 0) {
  process.exitCode = 1
}
