import {runReviewScenario} from './creative-review-harness.mjs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
execFileSync(process.execPath,['--import','tsx','scripts/test-creative-review-contract.mts'],{stdio:'inherit',env:{...process.env,AMC_MM_REPO:process.env.AMC_MM_REPO||fileURLToPath(new URL('../../amc-mm',import.meta.url))}})
execFileSync(process.execPath,['--import','tsx','scripts/test-creative-history.mts'],{stdio:'inherit'})
for (const scenario of (process.env.REVIEW_SCENARIOS || 'schedule-newer-script,unschedule-newer-script,schedule-superseded,unschedule-superseded,unschedule,multi-account,stale-account,workspace,source,sku,sku-empty,revisions,editable-candidate,ownership,stale,readback-auth,post-rejected,history-save,history-adopt,history-sku,schedule-only,edit-only,long-sku,history-gap,history-multi-gap,history-contiguous').split(',')) await runReviewScenario(scenario)
