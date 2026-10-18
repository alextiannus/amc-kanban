# AMC Skills unified package

Status: implementation authorized by the user on 2026-10-18; location `amc-kanban/packages/amc-skills`.

## Scope

Manage all 15 existing file-based AMC Skills in one package, with their complete resources. Include Content's repository-backed native/anti-AI/rule catalog as a clearly scoped installable adapter with generated reference data. Database overrides and merchant data are excluded. No new repository, npm registry publication, authentication or business behavior.

## Ownership and compatibility

- `packages/amc-skills/skills` is the authoring source for file-based Skills and Content static rule files. Existing Kanban/Growth/Content paths remain generated consumer copies so production loaders and Skill IDs keep working.
- Content TypeScript still defines executable Skill composition. A read-only exporter snapshots repository defaults for installation; it never hydrates database overrides. Generated catalog entries retain IDs, versions, scopes, priorities and provenance. They are not automatically active runtime rules.
- Manifest records audience (`external`, `repository`, `host`, `compatibility`), prerequisites, dependencies, origins, consumer destinations and per-file hashes. Exported resources stay within each installable Skill.
- Host-only Skills require explicit selection; external installation defaults to portable/MCP capabilities. Installing does not grant tool access or execute workflows.
- Normalize standard frontmatter in canonical platform Skills; compatibility generation restores fields required by the old parser. Preserve old names and runtime behavior.

## Distribution

GitHub directory contains separate `skills/<name>/SKILL.md` folders, never a root SKILL that hides nested discovery. README gives whole-package and single-Skill installation via existing agent installers and dependency-free local installer. Installer requires an explicit destination, refuses existing directories and installs transitive Skill dependencies. No postinstall hooks. Pin Git SHA for reproducibility. Private repository access uses the caller's existing Git authorization.

## Validation

Dependency-free validation checks unique IDs, valid frontmatter, paths/links, dependency cycles, file hashes, complete resources, consumer drift and deterministic ZIP. Integration tests cover installing one/all external Skills, refusal to overwrite, dependency installation, stale consumer detection and path/symlink rejection. Existing canonical marketing Skill tests and platform-loader checks must pass. Verify a fresh GitHub checkout and temporary installation after push; distinguish that from live production delivery.
