import {runReviewScenario} from './creative-review-harness.mjs'
for(const scenario of (process.env.REVIEW_SCENARIOS||'schedule-newer-script,unschedule-newer-script,schedule-superseded,unschedule-superseded,unschedule,multi-account,stale-account').split(','))await runReviewScenario(scenario)
