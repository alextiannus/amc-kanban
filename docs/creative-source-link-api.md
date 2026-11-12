# Creative browser original links

Status: implemented and targeted local regressions passed (2026-11-12). Commit and push status are recorded by repository history and remote SHA verification; deployment, production role updates and live acceptance remain pending.

In a single idea's More actions, show **查看原始链接 / View original link** immediately after Search creative library. Only users with `draft.view-source-link` and current brand read access may use it; ADMIN retains access. Grant this separate capability to AMC_PRINCIPAL and the existing part-time principal role by stable RoleDefinition ID, never by runtime display-name matching. Other editors and brand owners do not receive it by default. Disabled roles and inactive users are denied. Do not reuse draft.update or inspiration-library.read. The new view-only action must not qualify a role for brand WRITE access in the shared legacy brand gate.

The menu is absent in list view and while cached permissions await a live read. An authorized user sees a disabled entry with **暂无原始链接 / No original link available** when the idea has no usable original link. A click reserves a new tab synchronously, detaches its opener, queries the protected endpoint, then navigates; close the reserved tab on errors, unmount or idea changes. Preserve the current browse position and display errors on the current page. Blocked popups receive an explicit retry instruction.

## Wire contract

- Brainstorm feed adds optional boolean `canViewOriginalLink` (missing means false for old servers). Items add optional boolean `hasOriginalLink`. These projections do not include the original URL. Cached previews always reset the permission to false until a current server read succeeds.
- `GET /api/brands/{brandId}/ai/brainstorm/{sourceId}/source-link?browseSessionId={uuid}&creativeId={savedCreativeId}&sourceDigest={sha256}` returns `{ "url": "https://..." }`. browseSessionId and creativeId are optional; sourceDigest is required and pins the item actually clicked. No client-supplied destination is accepted.
- Revalidate authenticated active human identity, effective grants, brand access, and source membership in the current scoped feed, imported sources, pool, own favorites, or the specified saved brand creative. Enforce dislikes and source ID/version/digest consistency against current Content evidence. Recheck authorization before returning the URL after external evidence retrieval.
- Resolve originalPostUrl, sourceVideo.sourceUrl or sourcePost.sourceUrl from verified evidence, allowing only absolute HTTP/HTTPS URLs without credentials. Never use originalVideoUrl/media URL or fall back to an older snapshot after evidence failure.
- Every response uses `Cache-Control: no-store`. Errors: 400 invalid input; 401 expired session; 403 missing capability; 404 inaccessible brand/source or missing link; 409 source changed; 503 evidence unavailable. Return error codes only, without source URLs.

## Rollout

No new database tables. Synchronize Kanban and Content permission contracts and deploy Content, Kanban, then MM. Use the existing version-checked role policy API to add only `draft.view-source-link` (and its required draft.read if absent) to AMC_PRINCIPAL and the verified part-time principal role ID. Preserve other grants, inspect the proposed additions before applying, and retain the API's audit records. Never guess or create a part-time role automatically. Policy preparation is dry-run by default; applying role changes is a separate release step. Check pushed commits, deployments and live role acceptance separately.

Run `npx tsx scripts/prepare-creative-source-link-permissions.mts` with `AMC_MAIN_APP_URL` and `AMC_ADMIN_API_KEY` supplied through the environment to list role IDs without changing them. Verify the part-time principal role, set `AMC_PART_TIME_PRINCIPAL_ROLE_ID`, and run again to review the exact additive changes. After the matching contracts are deployed, use `--apply` to save with version checks, audit and read-back. A conflict stops the script; rerun the preview against fresh policies before retrying. This implementation does not configure production roles automatically.

Acceptance covers authorized roles, other editors/owners, direct endpoint denial, cross-brand access, role disable/revoke during evidence reads, video/post/manual/saved sources, missing/unsafe links, changed evidence, actor-scoped cached previews, popup errors, late responses after switching ideas, and mobile/desktop rendering.

## Local validation (2026-11-12)

- Kanban and MM `npm run test:creative-source-link` pass. Real Chromium UI coverage includes 320/390/768/1440px, Chinese/English menus, detached opener, source pins, missing links, blocked popups, source-change/unavailable errors, permission denial, late responses, cached role flags and unmount cancellation. UI API responses are fixtures; no production or paid provider calls were made.
- Kanban role/custom-role regressions, brainstorm service/video/route regressions and Content role-permission regressions pass. MM browse read/seed/contract and creative usage UI regressions pass. All three repositories pass their typecheck commands; permission contracts are byte-identical.
- Existing MM `test:creative-browser-ui` stops at its old "browse does not refresh cached content or mutate it" assertion because automatic load-more sends one POST. The identical failure was reproduced with HEAD source substituted into the browser bundle; this is an existing test/baseline mismatch, not claimed as a pass.
- Test artifacts are in MM `output/playwright/creative-source-link/`. Production role IDs and effective grants have not been verified or changed; run the release preview before applying the additive policy update.
