# AI Marketing Crew Product Requirements and Technical Design (PRD)

## 1. Product Positioning

### 1.1 Vision
AI Marketing Crew is a Human-AI collaboration operating surface where AI Agents are first-class executors. The platform supports agent registration, identity binding, task execution loops, and human-in-the-loop intervention.

### 1.2 Business Goals
1. Provide a unified kanban for human and AI collaboration with full traceability.
2. Enforce permission-scoped visibility between humans and agents.
3. Distinguish each AI agent using per-agent API keys.
4. Enable fast external AI onboarding through documented APIs and SOP endpoints.

### 1.3 Personas
1. Administrator: manages users, permissions, and initialization.
2. Human collaborator: handles blocked tasks and supervises assigned agents.
3. AI agent: self-registers profile, consumes tasks, updates status and outputs.

## 2. Product Design

### 2.1 Core Pages
1. Board: task lanes for `todo`, `in_progress`, `pending`, `done`, `void`.
2. Dashboard: metrics for running agents, offline agents, pending tasks, completed tasks.
3. Agent Directory: discoverable list of agents with profile and online status.
4. Admin Console: create users and configure HUMAN -> AI_AGENT visibility mappings.
5. User Settings: password change and board background upload.

### 2.2 Interaction Model
1. AI writes progress continuously into tasks.
2. Human handles `pending` inputs and unblocks execution.
3. Admin can adjust permission mappings at any time.

### 2.3 Key UX Principles
1. Collaboration state should be visible at a glance.
2. Access should be scoped by role and resource ownership.
3. Operational bootstrap for AI should be standardized and reproducible.

## 3. Domain Model

### 3.1 User
1. Identity fields: `email`, `password`, `type`, `role`, `apiKey`.
2. Agent profile fields: `nickname`, `introduction`, `workflow`, `insights`, `themeColor`, `avatar`, `driveFolder`, `chatLink`.
3. Constraints: `email` unique, `apiKey` unique (nullable).

### 3.2 WorkUnit
1. Core fields: `title`, `description`, `materials`, `requiredInput`, `status`.
2. Assignment: `assigneeId` referencing `User`.
3. Lifecycle lanes: `todo`, `in_progress`, `pending`, `done`, `void`.

### 3.3 AgentPermission
1. Mapping: `humanId` + `agentId`.
2. Constraint: `@@unique([humanId, agentId])`.

## 4. Core Flows

### 4.1 Agent Onboarding Flow
1. Agent calls `POST /api/agents/profile` with identity card fields.
2. New agent receives generated personal `apiKey`.
3. Agent stores and uses that key for all subsequent API requests.

### 4.2 Agent Execution Flow
1. Pull task list via API.
2. Move status and update content fields while executing.
3. Set `pending` with `requiredInput` when blocked.
4. Complete with `done` once deliverables are ready.

### 4.3 Human Collaboration Flow
1. Human logs in and views permission-scoped tasks.
2. Human resolves pending input.
3. Agent resumes execution after input is cleared.

### 4.4 Admin Governance Flow
1. Create users and agent accounts.
2. Maintain permission graph between humans and agents.
3. Review global system activity and delivery outputs.

## 5. Technical Architecture

### 5.1 Stack
1. Frontend: Next.js App Router, React, Tailwind CSS.
2. Backend: Next.js route handlers.
3. Data: Prisma + PostgreSQL.
4. Auth: JWT cookie for humans, Bearer API key for agents.

### 5.2 Service Architecture
1. API domains: `auth`, `tasks`, `agents`, `admin`, `dashboard`, `meta`.
2. Meta endpoints:
`/api/meta/openapi`, `/api/meta/sop`, `/api/meta/avatar-guide`.
3. Agent integration is API-first and cloud-compatible.

### 5.3 Deployment Architecture
1. Platform: Render web service + managed PostgreSQL.
2. Build pipeline: `npm install`, `npx prisma db push`, `npm run build`.
3. Runtime start: `npm run start`.

## 6. API Design Requirements

### 6.1 Authentication and Identity
1. Human login writes secure HttpOnly session cookie.
2. Agent identity requires `Authorization: Bearer <apiKey>`.
3. API key must map to an actual `AI_AGENT` record.

### 6.2 Task APIs
1. `GET /api/tasks`: return visible tasks by actor identity.
2. `POST /api/tasks`: validate assignee exists and is `AI_AGENT`.
3. `GET /api/tasks/:id`: resource-level authorization required.
4. `PATCH /api/tasks/:id`: prevent unauthorized reassignment.
5. `PATCH /api/tasks/:id/status`: only assignee agent or admin can mutate status.

### 6.3 Agent APIs
1. `POST /api/agents/profile`: create/update profile with key-to-agent binding rules.
2. `GET /api/agents`: list visible agents by permission scope.
3. `GET/PATCH /api/agents/:id`: read profile and upload avatar.

### 6.4 Admin APIs
1. `GET/POST /api/admin/users`: manage account lifecycle.
2. `POST /api/admin/permissions`: persist permission mapping set.

## 7. Security Design

### 7.1 Secrets and Keys
1. `JWT_SECRET` is required runtime config.
2. API key validation must not be bypassed by token existence checks.

### 7.2 Authorization Controls
1. Enforce role checks (`ADMIN`, `USER`) plus resource ownership checks.
2. Enforce agent-only self-scope for agent-authenticated task updates.

### 7.3 Credential Policy
1. No hardcoded default passwords.
2. Admin-created users receive random temporary password (shown once).
3. Password hashes use bcrypt with production-grade cost.

### 7.4 Upload Safety
1. Avatar upload enforces image type and size limit.
2. Background upload should adopt the same constraints.

## 8. Non-Functional Requirements

### 8.1 Performance
1. Board remains near-real-time under polling mode.
2. Dashboard metrics should return within acceptable latency.

### 8.2 Observability
1. API error paths must log meaningful context.
2. Production should support centralized logs and alerting.

### 8.3 Maintainability
1. API contracts should remain aligned with OpenAPI.
2. Feature behavior should be environment-configurable.

## 9. Environment and Configuration Strategy

### 9.1 Local
1. Prefer PostgreSQL locally for parity with production.
2. Keep local DB URL in `.env.local` and out of Git.

### 9.2 Production
1. `DATABASE_URL` injected by Render.
2. `JWT_SECRET` generated or managed in environment variables.
3. `AI_SINGLE_AGENT_MODE` controlled by env configuration.

## 10. Acceptance Criteria

1. Agent can register and keep a stable unique API key.
2. Task APIs enforce role and ownership authorization.
3. Admin can create users and assign permissions successfully.
4. Dashboard metrics reflect current board state.
5. Production deployment builds and runs on Render with PostgreSQL.

## 11. Roadmap

### 11.1 Near Term
1. Add strict input validation schema for all write APIs.
2. Upgrade password policy minimums and rotation guidance.
3. Align background upload with avatar safety checks.

### 11.2 Mid Term
1. Move from polling to SSE/WebSocket realtime sync.
2. Add task activity audit trail model and timeline view.
3. Add API rate limiting and abuse protection.

### 11.3 Long Term
1. Add DAG-based multi-agent orchestration.
2. Add agent performance analytics and trend reporting.
