# Autopilot research creation repair

History ID: AMC-20261102-AUTOPILOT-RESEARCH-01

- Recorded: 2026-11-02, Asia/Shanghai (UTC+08:00).
- Author: Codex, requested by the user after the November 2 overnight research incident.
- Affected requirements: `docs/prd_amc.md`, `docs/prd_amc_mm.md`, `docs/amcmm-iaic-implementation.md`, brand autopilot scope and research reuse. Canonical autopilot Skill and its compatibility distribution describe the same policy.
- Before: autopilot reused only complete Growth reports generated within seven days; otherwise it submitted a new forced research job. The separate Growth refresh timer switch did not control this path.
- After: autopilot reuses saved reports with their original timestamps and reconciles already-bound jobs. Missing reports produce explicit limited evidence based on confirmed brand facts. Scheduled autopilot never creates or retries research. Manual research remains available.
- Impact: prevents daily forced research submissions without disabling brand planning, manual research, or reconciliation of existing jobs. Unknown submission state remains unknown.
- Skill delivery: package paths use forward slashes and case-sensitive ordering on all hosts so Windows regeneration preserves the same manifest and archive structure as Linux.
- Implementation: completed. Validation passed: TypeScript project typecheck with a freshly generated Prisma client; real capability/HTTP-bridge regression checks for old/missing reports, replay, new day, unknown/original jobs, automatic POST rejection and manual POST preservation; Growth research-context tests; eight package tests and package/consumer/archive consistency checks. Provider HTTP responses are fixtures and no paid research was submitted during validation.
- Deployment: pending production verification at the time of this entry; the final delivery records the actual remote and live commit separately.
- Shared ledger status: BLOCKED. The required `/Users/immedi/Documents/ChatGPT/AMC/AGENTS.md` and `/Users/immedi/Documents/ChatGPT/AMC/VERSION_HISTORY.md` are unavailable on this Windows workspace. This is a pending reconciliation receipt, not a replacement shared ledger; no prior history or ledger pointers were changed. Copy this record into the original shared ledger when it becomes accessible.
