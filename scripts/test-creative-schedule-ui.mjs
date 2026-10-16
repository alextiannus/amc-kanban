import {runReviewScenario} from './creative-review-harness.mjs'
for(const scenario of (process.env.REVIEW_SCENARIOS||'unschedule,multi-account,stale-account').split(','))await runReviewScenario(scenario)
