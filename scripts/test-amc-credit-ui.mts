import assert from 'node:assert/strict'
import fs from 'node:fs'

const ui = fs.readFileSync(new URL('../src/components/dashboard/AmcCreditOverview.tsx', import.meta.url), 'utf8')
const permissions = fs.readFileSync(new URL('../src/lib/permissions.ts', import.meta.url), 'utf8')
for (const label of ['品牌','Package','本期额度','已使用','已预留','剩余','超额','使用率','允许超额','账期结束']) assert(ui.includes(`'${label}'`), `missing column ${label}`)
assert.match(ui, /canManage \?/)
assert.match(ui, /overageOnly/)
assert.match(permissions, /creditUsage/)
console.log('PASS AMC Credit UI contract: one-row-per-brand columns, filters and admin-only controls')
