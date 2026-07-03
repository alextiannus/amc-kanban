#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const apiRoot = path.join(root, 'src/app/api')
const docPath = path.join(root, 'docs/API_SERVICES.md')
const openApiPath = path.join(root, 'skills/kanban-openapi.yaml')
const startMarker = '<!-- API_ROUTE_INVENTORY:START -->'
const endMarker = '<!-- API_ROUTE_INVENTORY:END -->'

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

function routePath(filePath) {
  const relativeDirectory = path.relative(apiRoot, path.dirname(filePath))
  const segments = relativeDirectory.split(path.sep).map((segment) => {
    const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
    if (catchAll) return `{${catchAll[1]}...}`
    const dynamic = segment.match(/^\[(.+)\]$/)
    return dynamic ? `{${dynamic[1]}}` : segment
  })
  return `/api/${segments.join('/')}`
}

function routeMethods(source) {
  const methods = new Set(
    [...source.matchAll(
      /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
    )].map((match) => match[1]),
  )

  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const exported of match[1].split(',')) {
      const method = exported.trim().match(
        /(?:\w+\s+as\s+)?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/,
      )
      if (method) methods.add(method[1])
    }
  }

  return [...methods].sort()
}

const routes = walk(apiRoot)
  .filter((filePath) => filePath.endsWith(`${path.sep}route.ts`))
  .map((filePath) => ({
    path: routePath(filePath),
    methods: routeMethods(fs.readFileSync(filePath, 'utf8')),
  }))
  .sort((a, b) => a.path.localeCompare(b.path))

const routesWithoutMethods = routes.filter((route) => route.methods.length === 0)
if (routesWithoutMethods.length > 0) {
  throw new Error(
    `Could not detect methods for: ${routesWithoutMethods.map((route) => route.path).join(', ')}`,
  )
}

const operationCount = routes.reduce((sum, route) => sum + route.methods.length, 0)
const normalizeContractPath = (value) => value.replace(/\{[^}]+\}/g, '{param}')
const routeOperations = new Set(
  routes.flatMap((route) =>
    route.methods.map((method) => `${method} ${normalizeContractPath(route.path)}`),
  ),
)

let currentOpenApiRoute = ''
const openApiOperations = []
for (const line of fs.readFileSync(openApiPath, 'utf8').split('\n')) {
  const pathMatch = line.match(/^  (\/[^:]+):$/)
  if (pathMatch) {
    currentOpenApiRoute = `/api${pathMatch[1]}`
    continue
  }
  const methodMatch = line.match(/^    (get|post|put|patch|delete|options|head):$/)
  if (currentOpenApiRoute && methodMatch) {
    openApiOperations.push(
      `${methodMatch[1].toUpperCase()} ${normalizeContractPath(currentOpenApiRoute)}`,
    )
  }
}

const invalidOpenApiOperations = openApiOperations.filter(
  (operation) => !routeOperations.has(operation),
)
if (invalidOpenApiOperations.length > 0) {
  throw new Error(
    `OpenAPI operations without Route Handlers: ${invalidOpenApiOperations.join(', ')}`,
  )
}

const lines = [
  startMarker,
  '## 8. 完整 Route Handler 清单（自动生成）',
  '',
  `共 **${routes.length}** 个 API 路径、**${operationCount}** 个 HTTP 方法组合。`,
  '',
  '> 此段由 `npm run docs:api` 从 `src/app/api/**/route.ts` 生成，请勿手工编辑。',
  '',
  '| 方法 | 路径 |',
  '| --- | --- |',
  ...routes.map((route) => `| ${route.methods.join(', ')} | \`${route.path}\` |`),
  endMarker,
].join('\n')

const current = fs.readFileSync(docPath, 'utf8')
const start = current.indexOf(startMarker)
const end = current.indexOf(endMarker)
const next = start >= 0 && end >= 0
  ? `${current.slice(0, start)}${lines}${current.slice(end + endMarker.length)}`
  : `${current.trimEnd()}\n\n${lines}\n`

if (process.argv.includes('--check')) {
  if (current !== next) {
    console.error('API route inventory is stale. Run: npm run docs:api')
    process.exit(1)
  }
  console.log(
    `API route inventory is current (${routes.length} paths, ${operationCount} operations; ${openApiOperations.length} Agent operations verified).`,
  )
} else {
  fs.writeFileSync(docPath, next)
  console.log(`Updated API route inventory (${routes.length} paths, ${operationCount} operations).`)
}
