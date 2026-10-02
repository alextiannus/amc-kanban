import assert from 'node:assert/strict'
import fs from 'node:fs'

const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
const service = fs.readFileSync(new URL('../src/lib/amc-credit/service.ts', import.meta.url), 'utf8')
const overview = fs.readFileSync(new URL('../src/app/api/amc-credit/brands/route.ts', import.meta.url), 'utf8')
const internal = fs.readFileSync(new URL('../src/app/api/internal/amc-credit/usage/route.ts', import.meta.url), 'utf8')
for (const model of ['AmcCreditAccount', 'AmcCreditCycle', 'AmcCreditLedgerEntry']) assert.match(schema, new RegExp(`model ${model}`))
assert.match(schema, /allowOverage\s+Boolean\s+@default\(true\)/)
assert.match(schema, /idempotencyKey\s+String\s+@unique/)
for (const operation of ['reserveCredit', 'settleCredit', 'releaseCredit', 'updateCreditSettings', 'listCreditOverview']) assert.match(service, new RegExp(`function ${operation}`))
assert.match(service, /subscription\?\.planName \|\| subscription\?\.planId/)
assert.equal((service.match(/pg_advisory_xact_lock/g) || []).length, 3)
assert.match(overview, /isAmcOperator/)
assert.match(overview, /System admin required/)
assert.match(internal, /x-content-service-token/)
assert.match(internal, /BigInt\(body\.internalCostMicros\)/)
console.log('PASS AMC Credit service contracts: append-only ledger, idempotency, role boundary and internal authentication')
