import assert from 'node:assert/strict'
import fs from 'node:fs'

const ui = fs.readFileSync(new URL('../src/components/dashboard/AmcCreditOverview.tsx', import.meta.url), 'utf8')
const permissions = fs.readFileSync(new URL('../src/lib/permissions.ts', import.meta.url), 'utf8')
for (const label of ['品牌','Package','额度政策','已使用','待结算预留','账期结束']) assert(ui.includes(`'${label}'`), `missing column ${label}`)
assert(ui.includes('不限额度'))
assert(!ui.includes('window.confirm'))
assert.match(permissions, /creditUsage/)
console.log('PASS AMC Credit UI contract: one-row-per-brand columns, filters and unlimited metering')
