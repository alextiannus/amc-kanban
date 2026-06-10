# Partner Module

Partner-facing integration surfaces live here so external agent, MCP, and skill-serving code stays isolated from core product modules.

- `mcp/`: MCP server registration and partner tool handlers.
- `skills.ts`: partner skill document loading and response helpers for `/api/meta/skills/*` routes.

Keep API routes thin: validate transport-level concerns in the route, then delegate partner behavior to this module.
