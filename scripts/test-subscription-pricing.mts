import { calculatePricing, MONTHLY_SERVICE_ADDONS, MONTHLY_SERVICE_PLANS, normalizeAddonQuantity } from '../src/lib/subscription/catalog.ts'

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
  const starter = calculatePricing('starter', 12, [])
  assertEqual(starter.totalDueUsd, 5200, 'starter annual total')
  assertEqual(starter.monthlyBaseUsd, 433.33, 'starter monthly equivalent')

  const essential = calculatePricing('essential', 12, [])
  assertEqual(essential.totalDueUsd, 10600, 'essential annual total')

  const booster = calculatePricing('booster', 12, [])
  assertEqual(booster.totalDueUsd, 16800, 'booster annual total')

  const videoUnits = calculatePricing('essential', 12, ['video_generation_scripts', 'video_generation_tokens'], {
    video_generation_scripts: 2,
    video_generation_tokens: 3,
  })
  assertEqual(videoUnits.totalDueUsd, 11600, 'variable video costs use unit quantity')

  const clamped = calculatePricing('starter', 12, ['video_generation_scripts'], { video_generation_scripts: 30 })
  assertEqual(clamped.totalDueUsd, 9200, 'variable cost quantity is capped at 20')
  assertEqual(normalizeAddonQuantity('video_generation_tokens', 30), 20, 'stored variable cost quantity is capped at 20')
  assertEqual(normalizeAddonQuantity('video_generation_tokens', 0), 1, 'stored variable cost quantity has minimum 1')

  const hiddenMonthlyAddon = calculatePricing('starter', 12, ['xiaohongshu_ops'])
  assertEqual(hiddenMonthlyAddon.totalDueUsd, 12400, 'hidden monthly add-ons remain billable for preserved settings')

  assertEqual(MONTHLY_SERVICE_PLANS.length, 2, 'monthly service plan fallback preserved')
  assertEqual(MONTHLY_SERVICE_ADDONS.length, 11, 'monthly add-on fallback preserved')

  assertThrows(() => calculatePricing('essential', 6, []), 'annual plans reject 6 months')
  assertThrows(() => calculatePricing('booster', 3, []), 'annual plans reject 3 months')
  assertThrows(() => calculatePricing('bad-plan', 12, []), 'invalid plan check')

  console.log('[subscription-test] all pricing tests passed')
}

run()
