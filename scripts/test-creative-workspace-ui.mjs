import {runReviewScenario} from './creative-review-harness.mjs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
execFileSync(process.execPath,['--import','tsx','scripts/test-creative-review-contract.mts'],{stdio:'inherit',env:{...process.env,AMC_MM_REPO:process.env.AMC_MM_REPO||fileURLToPath(new URL('../../amc-mm',import.meta.url))}})
for (const scenario of (process.env.REVIEW_SCENARIOS || 'workspace,source,sku,sku-empty,revisions,editable-candidate,ownership,stale,readback-auth,post-rejected,history-save,history-adopt,history-sku,schedule-only,edit-only,long-sku').split(',')) await runReviewScenario(scenario)
