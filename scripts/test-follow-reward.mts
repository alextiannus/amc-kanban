import assert from 'node:assert/strict'
import { followRewardDescription, DEFAULT_FOLLOW_REWARD_DESCRIPTION } from '../src/lib/followReward.ts'
assert.equal(followRewardDescription(null), '关注账号，可获赠饮品一份')
assert.equal(followRewardDescription(undefined), DEFAULT_FOLLOW_REWARD_DESCRIPTION)
assert.equal(followRewardDescription(null, 'en'), 'Follow us and enjoy a complimentary drink.')
assert.equal(followRewardDescription(DEFAULT_FOLLOW_REWARD_DESCRIPTION, 'en'), 'Follow us and enjoy a complimentary drink.')
assert.equal(followRewardDescription(''), '')
assert.equal(followRewardDescription('  '), '')
assert.equal(followRewardDescription('  商家自定义礼遇  ', 'en'), '商家自定义礼遇')
console.log('PASS default follow drink offer, locale adaptation, explicit opt-out and custom merchant copy.')
