# TikTok own-brand disclosure validation — 2026-11-10

## Scope and release status

- Isolated branch `codex/fix-tiktok-brand-organic-20261110`, based on fetched `origin/main` `cf26111a`.
- Adds optional boolean `tiktokBrandOrganic` to PostFast publish/draft types, whitelist, runtime validation, MCP schemas and direct HTTP request type. Draft PATCH preserves other controls and locks disclosure changes after publication starts or a provider post ID exists. The shared confirmation page names the setting “自有品牌推广披露”.
- MCP `publish`, `board_publish_content`, `postfast_publish`: `postfastControls.tiktokBrandOrganic`. Direct brand post POST: top-level `tiktokBrandOrganic`. Draft create/PATCH: `postfastControls.tiktokBrandOrganic`.
- Only explicit true for TikTok emits `controls.tiktokBrandOrganic: true`. False/omitted remains off; other platforms receive no field. AI-generated disclosure and paid-partnership disclosure are independent. No automatic enablement or historical backfill.
- Official contract checked: https://postfa.st/docs/posts/create lists boolean, optional, default false, “Your own brand promotion.”
- No schema/migration change, production data write, remote publication, push or deployment. No real test post was created. A separate deployment decision and exact deployed-revision verification are still needed; local mock tests do not establish TikTok's visible label or current production MCP support.

## Verification

- Red/green: the new draft regression initially rejected valid own-brand booleans with 400; the real in-memory MCP list lacked the property. Both pass after the fix.
- `npm run test:tiktok-disclosures`: passed. Draft permission denial, strict boolean input, merge/readback, retention of the other disclosure, publishing/published/provider-ID locks, legacy local schedules and stale-write guards; queue snapshot/retry preservation for true/false/omitted and immediate/scheduled; actual MCP transport covers discovery, all three aliases, invalid types, handler and idempotency payload, and denied permissions. Provider and persistence are mocked.
- `npm run test:postfast-integration`: passed with a localhost mock provider. TikTok true/false/omitted, video and image carousel, scheduled/omitted time, other-platform exclusion, independent AI and own-brand fields, invalid controls rejected without POST, plus existing media/account/platform cases.
- `node --import tsx scripts/test-social-account-unbinding.mts`, `scripts/test-media-validation.mts`, `scripts/test-postfast-delivery.mts`: passed.
- `npm run typecheck`: passed after the final source changes.
- `PLAYWRIGHT_CHANNEL=chrome node scripts/test-tiktok-brand-confirmation-ui.mjs`: isolated local UI verifies on/off/omitted disclosure labels, 320/390/1440 widths, one fixture submit and reload recovery. All non-local requests are aborted. Browser launch needs permission to run outside the desktop shell sandbox; the bundled Playwright browser is not installed, so the installed Chrome uses a temporary profile.
- Production webpack build passed using a non-serving localhost fixture DATABASE_URL and DISABLE_PWA=true. No production credentials were loaded. Runtime is installed Node 24.14.0, while package engines requests Node 20; no Node 20 runtime validation was performed.
- Lint on affected source files retains exactly the HEAD baseline: 38 errors and 6 warnings, no new findings. PostFast integration and direct-post route individually have no lint findings. Do not call the full repository lint clean.
- `git diff --check`: passed. No dependency versions or lockfile changes. Test runners use the existing tsx dependency because direct Node type stripping cannot resolve a pre-existing extensionless import in current source.

## Safe release and rollback

Do not publish test content to validate deployment. Once deployment is authorized, recheck origin/main and integrate only this patch, verify no unexpected migration is introduced or pending in the service's existing build process, observe the exact deployed commit and health, and read production MCP tools/list to confirm the boolean exists on all aliases. A real TikTok label check is separate and must use authorized content. Rollback is a single revert of this patch and the normal reviewed deployment, with no database rollback or data cleanup.

PRD ledger IDs: PRD-20261110-TIKTOK-BRAND-ORGANIC-001 and PRD-20261110-TIKTOK-BRAND-ORGANIC-002.
