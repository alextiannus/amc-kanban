import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [scriptSource, packageSource] = await Promise.all([
  readFile(new URL('./clear-brand-plan-calendar.mts', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
])

assert(scriptSource.includes("if (!brandId) throw new Error('--brand-id is required.')"))
assert(scriptSource.includes("if (!month || !/^\\d{4}-\\d{2}$/.test(month))"))
assert(scriptSource.indexOf("snapshotType: 'BEFORE_CLEAR'") < scriptSource.indexOf("action: 'save_workspace_patch'"))
assert(scriptSource.includes("body: { target: 'calendar_month', month, value: [] }"))
assert(scriptSource.includes("'otherCalendarMonths'"))
assert(scriptSource.includes('calendar_clear_readback_failed:'))

const packageJson = JSON.parse(packageSource)
assert.equal(packageJson.scripts['brand-plan:clear-calendar:dry-run'], 'tsx scripts/clear-brand-plan-calendar.mts --dry-run')
assert.equal(packageJson.scripts['brand-plan:clear-calendar'], 'tsx scripts/clear-brand-plan-calendar.mts --apply')

console.log('Brand plan calendar clear tests passed.')
