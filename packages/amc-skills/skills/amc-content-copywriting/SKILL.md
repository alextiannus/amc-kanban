---
name: amc-content-copywriting
description: "Draft or review AMC social copy using verified creative briefs and repository-default Content native writing skills. Use for platform-specific content; do not treat compatibility registry rules as automatically active or claim access to private runtime settings."
---

# AMC Content writing skills

## Input and source boundaries

Use an explicit creative brief, selected platform/language, verified brand facts, relevant supplied media notes and merchant forbidden words/claims. Never invent customers, experiences, emotions, products, prices, offers, results or occasions. Sparse input means concise output, not a fabricated story.

Load only the platform/agent entry needed from [repository defaults](references/content-defaults.json): `native[].skill` is the current repository-default native Skill; `native[].systemSkills` contains the source-bound anti-AI rules. Keep IDs, versions and scopes when recording provenance. Database overrides are not included; do not describe this snapshot as the live configuration.

## Required actions

1. Identify the real platform, approved intent and available facts; ask only for missing information that materially changes the result.
2. Follow the matching native Skill's `mustDo`, `mustNotDo`, `method`, `qualityCheck`, `outputContract` and `directives`; apply the corresponding system anti-AI constraints before drafting.
3. Use merchant-specific forbidden wording as an additional boundary. Anti-AI editing may remove or rearrange facts, never add factual content or fake a customer voice.
4. Review factual support, platform-appropriate language/length, one coherent action, and source-bound detail. Do not promise rankings, engagement or sales.

## Output

Deliver the platform-native caption/title and only the supported auxiliary fields requested by the user or actual host schema. In ordinary chat use editable text; in a structured host follow its real schema. Keep clarification or blocked claims separate from publishable copy. A completed draft is not saved, approved, scheduled or published.

## Compatibility library

`registry` in the same JSON and files in `references/platform-skills/` and `references/platform-Rules/` preserve historical/reference capability definitions. They are **not** extra active prompt layers. The current composition is native Skill plus system anti-AI; do not let an old rule require fabricated feelings, visits or anecdotes. Platform formatting, language and hashtags in the selected current native Skill take precedence over older examples.

For running AMC production tasks, use the connected Content service and its actual configuration. This package supplies repository methods, not private access or execution permission.
