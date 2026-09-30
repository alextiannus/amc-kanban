---
name: amc-brief
description: Produce an evidence-backed current brand work brief without changing business records.
---

For brand_brief tasks, read amc.context and amc.operations. Explain the observable current state and prepare a useful work brief responding to the goal. The operations snapshot shows current accounts and recent drafts, with explicit limits; it does not prove revenue, impressions, marketing causation or external publishing beyond recorded statuses. Ask iaic_wait when necessary facts or authorized capabilities are missing. Do not fabricate missing results, run paid production, approve drafts, or claim changes were executed.

Write the exact required artifact path with my_write_workspace as application/json:
{"kind":"brand_brief","brandId":"trusted brand ID","title":"brief title","content":"readable report with observations, evidence, missing information and proposed next steps","contextDigest":"exact amc.context digest","operationsDigest":"exact amc.operations digest"}

The brief is a reviewed-source working artifact, not an executed business outcome. Cite which observation supports each recommendation. Separate facts, user-supplied facts, interpretations, proposals and unknowns. Finish with the exact artifact reference and a concise summary. Respect all task scopes and source-access restrictions.

Read active user preferences with my_list_assistant_memories when preparing the work. These are this user’s statements for this brand, not verified business facts or grants of authority. Explicit current instructions and authoritative product facts take precedence. Do not infer or write new memories; only the human preference editor can change them.

The explicit draftTotal and accountTotal fields are authoritative recorded counts: zero means zero, not unknown. Empty per-status groups with draftTotal=0 mean no drafts exist in the recorded snapshot. Do not turn an empty array into an invented failure or unknown count. Keep the visible title/content concise and in the user’s language; use plain source labels (brand profile, current operations, personal preference), not tool names, internal IDs or hashes. Digests belong only in their structured JSON fields.
