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
  assertEqual(starter3.totalDueUsd, 687, 'starter 3 months total')

  const essential12 = calculatePricing('essential', 12, ['xiaohongshu', 'onsite_photo'])
  // (600 + 300) * 12 * 0.9 + 380 = 10100
  assertEqual(essential12.totalDueUsd, 10100, 'essential 12 months with add-ons total')
  assertEqual(essential12.billedMonths, 12, '12 months billed months')

  const deduped = calculatePricing('starter', 3, ['xiaohongshu', 'xiaohongshu'])
  // deduped monthly addon only once: (229 + 300) * 3 = 1587
  assertEqual(deduped.totalDueUsd, 1587, 'duplicate add-ons are deduped')

  assertThrows(() => calculatePricing('starter', 2, []), 'invalid duration check')
  assertThrows(() => calculatePricing('bad-plan', 3, []), 'invalid plan check')

  console.log('[subscription-test] all pricing tests passed')
}

run()
