# Consumer Contracts

## Consumer Types

`amc-growth` should support:

- External AI agents with token access.
- `amc-content` content generation.
- `amc-kanban` internal operation pages.
- `amc-mm` principal-facing embedded views.

## Recommended Access Model

Use API tokens with scoped permissions:

| Scope | Capability |
|---|---|
| `knowledge:read` | Read knowledge index and public merchant exports |
| `knowledge:intake` | Create intake notes |
| `knowledge:write` | Propose or apply curated file updates |
| `knowledge:publish` | Rebuild index, export merchants, build pages |
| `knowledge:admin` | Manage service plans and API tokens |

## API Shape

Recommended future endpoints:

```text
GET  /v1/knowledge/index
GET  /v1/merchants
GET  /v1/merchants/:merchantId
GET  /v1/merchants/:merchantId/growth-plan
GET  /v1/merchants/:merchantId/presentation
GET  /v1/merchants/:merchantId/content-briefs
GET  /v1/merchants/:merchantId/page
POST /v1/intake
POST /v1/merchants/:merchantId/export
POST /v1/merchants/:merchantId/page
```

## Dashboard Embedding

For `amc-kanban` and `amc-mm`, start with iframe or server-side HTML fetch:

```text
generated/public/merchants/{merchantId}/index.html
```

Later replace static HTML with live API-rendered components.

## External AI Agent Flow

1. User gives an AI agent a knowledge token.
2. Agent calls `POST /v1/intake` with raw notes.
3. AMC Knowledge AI Admin reviews or proposes file updates.
4. Human confirms if needed.
5. Agent or admin runs publish/export.
6. Consumers read updated JSON/HTML.
