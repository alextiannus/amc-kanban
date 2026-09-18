import assert from 'node:assert/strict'
import { allowedRoleWriteOrigin } from '../src/lib/role-permissions/request-origin.ts'

const previous = { nodeEnv: process.env.NODE_ENV, render: process.env.RENDER, appUrl: process.env.NEXT_PUBLIC_APP_URL }
try {
  process.env.RENDER = 'true'
  delete process.env.NEXT_PUBLIC_APP_URL
  const request = (origin: string) => new Request('http://127.0.0.1:10000/api/admin/roles', { headers: { origin } })
  assert.equal(allowedRoleWriteOrigin(request('https://amc-kanban.immedi.ai')), true)
  assert.equal(allowedRoleWriteOrigin(request('https://other.example')), false)
  assert.equal(allowedRoleWriteOrigin(request('http://127.0.0.1:10000')), false)
  process.env.NEXT_PUBLIC_APP_URL = 'https://kanban-staging.immedi.ai/admin'
  assert.equal(allowedRoleWriteOrigin(request('https://kanban-staging.immedi.ai')), true)
  assert.equal(allowedRoleWriteOrigin(request('https://amc-kanban.immedi.ai')), false)
  delete process.env.RENDER
  process.env.NODE_ENV = 'test'
  delete process.env.NEXT_PUBLIC_APP_URL
  assert.equal(allowedRoleWriteOrigin(request('http://127.0.0.1:10000')), true)
  assert.equal(allowedRoleWriteOrigin(request('https://other.example')), false)
  console.log('Role write origin checks passed')
} finally {
  for (const [key, value] of Object.entries({ NODE_ENV: previous.nodeEnv, RENDER: previous.render, NEXT_PUBLIC_APP_URL: previous.appUrl })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
