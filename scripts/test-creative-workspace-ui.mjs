import {runReviewScenario} from './creative-review-harness.mjs'
for (const scenario of (process.env.REVIEW_SCENARIOS || 'workspace,source,sku,sku-empty,revisions,editable-candidate,ownership,stale,readback-auth,post-rejected').split(',')) await runReviewScenario(scenario)
