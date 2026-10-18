# Intake Workflow

## Purpose

`inbox/` is the AI-friendly entry point for human users and external AI agents. It lets users submit messy information without directly editing official knowledge files.

## Supported Inputs

- Merchant owner interviews.
- WeChat or WhatsApp notes.
- Menu changes.
- New service-package decisions.
- Post examples.
- Competitor/account observations.
- Market trend notes.
- Performance feedback.

## Intake File Contract

Use:

```bash
npm run create:intake {merchantId} {kind} "{title}"
```

Supported `kind` examples:

- `onboarding`
- `menu-update`
- `post-example`
- `tracked-account`
- `performance`
- `service-plan`
- `market-note`

## AI Admin Duties

When processing an intake:

1. Preserve raw notes.
2. Extract factual claims.
3. Separate confirmed facts from assumptions.
4. List open questions.
5. Suggest exact file updates.
6. Curate confirmed updates into official files only after user approval or clear instruction.

## Destination Map

| Information | Destination |
|---|---|
| Merchant facts | `merchants/{merchantId}/profile.md` |
| Account links and ownership state | `merchants/{merchantId}/account-info.md` |
| Competitors | `merchants/{merchantId}/competitors.md` |
| Analysis | `merchants/{merchantId}/research.md` |
| Strategy | `merchants/{merchantId}/growth-plan.md` |
| Client/principal view | `merchants/{merchantId}/presentation.md` |
| Content requests | `merchants/{merchantId}/content-briefs.md` |
| Good post examples | `intelligence/post-examples/` |
| Account tracking | `intelligence/tracked-accounts/` |
| Market methods | `knowledge/` |

## Safety

Never save:

- Passwords.
- OTPs.
- Private tokens.
- Session cookies.
- Unredacted personal identity documents.
