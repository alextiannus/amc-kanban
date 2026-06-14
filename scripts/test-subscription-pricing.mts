import { calculatePricing } from '../src/lib/subscription/catalog.ts'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} failed. expected=${expected}, actual=${String(actual)}`)
  }
}

function assertThrows(fn: () => void, label: string) {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  if (!threw) {
    throw new Error(`${label} failed. expected to throw`)
  }
}

function run() {
  const starter3 = calculatePricing('starter', 3, [])
  assertEqual(starter3.totalDueUsd, 2400, 'starter 3 months total')

  const essential12 = calculatePricing('essential', 12, ['ordering_site', 'onsite_photo'])
  // (1800 + 220) * 12 * 0.9 + 380 = 22196
  assertEqual(essential12.totalDueUsd, 22196, 'essential 12 months with add-ons total')
  assertEqual(essential12.billedMonths, 12, '12 months billed months')

  const deduped = calculatePricing('starter', 3, ['ordering_site', 'ordering_site'])
  // deduped monthly addon only once: (800 + 220) * 3 = 3060
  assertEqual(deduped.totalDueUsd, 3060, 'duplicate add-ons are deduped')

  assertThrows(() => calculatePricing('starter', 2, []), 'invalid duration check')
  assertThrows(() => calculatePricing('bad-plan', 3, []), 'invalid plan check')

  console.log('[subscription-test] all pricing tests passed')
}

run()
