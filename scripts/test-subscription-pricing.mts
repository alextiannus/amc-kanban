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
  const booster3 = calculatePricing('booster', 3, [])
  assertEqual(booster3.totalDueUsd, 9600, 'booster 3 months total')

  const essential12 = calculatePricing('essential', 12, ['xiaohongshu_ops', 'onsite_photo'])
  // (800 + 600) * 12 + 300 = 17100
  assertEqual(essential12.totalDueUsd, 17100, 'essential 12 months with add-ons total')
  assertEqual(essential12.billedMonths, 12, '12 months billed months')
  assertEqual(essential12.discountUsd, 0, '12 months has no automatic discount')

  const deduped = calculatePricing('essential', 6, ['twelveeat_delivery_ops', 'twelveeat_delivery_ops'])
  // deduped monthly addon only once: (800 + 80) * 6 = 5280
  assertEqual(deduped.totalDueUsd, 5280, 'duplicate add-ons are deduped')

  const monthlyAddons = calculatePricing('essential', 6, ['grab_foodpanda_ops', 'youtube_ops'])
  // (800 + 300 + 800) * 6 = 11400
  assertEqual(monthlyAddons.totalDueUsd, 11400, 'monthly add-ons use current prices')

  const multiStore = calculatePricing('essential', 6, ['multi_store'], { multi_store: 2 })
  // (800 + 300 * 2) * 6 = 8400
  assertEqual(multiStore.totalDueUsd, 8400, 'multi-store add-on uses per-store price')

  const productionAddons = calculatePricing('booster', 3, ['short_video_six', 'influencer_visit', 'meituan_dianping_setup', 'twelveeat_delivery_setup'])
  // 3200 * 3 + 600 + 1500 + 2200 + 220 = 14120
  assertEqual(productionAddons.totalDueUsd, 14120, 'production add-ons use current prices')

  const dianpingOps = calculatePricing('essential', 6, ['meituan_dianping_ops'])
  // (800 + 200) * 6 = 6000
  assertEqual(dianpingOps.totalDueUsd, 6000, 'Meituan Dianping operations uses monthly price')

  assertThrows(() => calculatePricing('essential', 3, []), 'essential rejects 3 months')
  assertThrows(() => calculatePricing('booster', 6, []), 'booster rejects 6 months')
  assertThrows(() => calculatePricing('bad-plan', 3, []), 'invalid plan check')

  console.log('[subscription-test] all pricing tests passed')
}

run()
