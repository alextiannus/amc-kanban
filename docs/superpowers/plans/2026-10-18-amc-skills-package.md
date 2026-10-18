# AMC Skills package Implementation Plan

> For agentic workers: execute inline in this authorized session; preserve unrelated changes and verify each deliverable before publication.

**Goal:** Provide one maintainable AMC Skill package installable from its existing GitHub project.

**Architecture:** Canonical standard Skill directories, a manifest, dependency-free management tooling, generated compatibility copies and a deterministic archive. Content code-generated defaults are references with source hashes; database overrides remain runtime-owned.

**Tech Stack:** Markdown, JSON, Python 3 standard library, existing Node 20/tsx for read-only Content export.

**Spec:** `docs/superpowers/specs/2026-10-18-amc-skills-package.md`

## Global Constraints

- Do not change permissions, database records, publishing behavior or unrelated work.
- Preserve Skill IDs and old runtime paths; do not add runtime network dependencies.
- Host-only Skills require explicit selection; installed Skills do not grant tool access.

## Tasks

- [x] Inventory and import 15 file-based Skills, all references, OpenAPI and agent metadata; normalize portable paths and platform frontmatter.
- [x] Export Content repository-default rules/native/anti-AI definitions using `node --import tsx`; include static files and a scoped adapter without private configuration.
- [x] Implement `scripts/manage.py` with `list`, `refresh`, `check`, `sync`, `build`, `install`; record and verify hashes and dependencies, refuse unsafe/overwrite paths.
- [x] Add `scripts/test_package.py` with isolated install, dependency, drift, archive, symlink and traversal scenarios; run `python3 packages/amc-skills/scripts/test_package.py`.
- [x] Generate legacy copies and marketing/full ZIPs; run existing `scripts/test-marketing-expert.mts` and platform-loader checks against generated copies.
- [x] Update affected PRDs, instructions and README; add CI validation for package and Kanban consumer drift.
- [ ] Review scoped diffs, push GitHub, verify fresh checkout install into a temporary destination and record exact SHA. Check any triggered production deployment separately.

User refinements implemented: three visible stages, integrated direction/selling points, explicit information gaps, result-first interview with collapsed source details and direct PDF download. Backend and frontend Node20 production builds and 320/390/768/1440 actual-component checks passed locally.
