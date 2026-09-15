# Unified model management

Status: code implementation and local validation. Production migration, import, activation and business acceptance are separate release steps.

## Contract

Kanban `/admin` system settings is the configuration authority. Connections contain a vendor name, protocol, endpoint and encrypted credential. Immutable catalog entries share connection versions. Policy revisions select capability defaults and media task exceptions.

Text uses one default in Kanban, Content and MM. Media chooses a source/task/platform exception, a source/task exception, then its capability default. Missing configuration, incompatible capabilities and provider errors fail explicitly. CN Gateway's internal provider keys and implementations stay in the gateway.

After activation Content's model page is read-only, MM displays effective central metadata, and old model write APIs are locked. Restoring a selection publishes a historical selection as a new central version. There is no decentralized-mode restore switch. Prompts, language, assets, voice identities and parsing remain business settings.

## Records and credentials

- ModelConnection: immutable AES-GCM encrypted connection versions.
- ModelCatalogEntry: immutable model definitions and legacy references.
- ModelPolicyRevision/ModelPolicyState: history and transactional current pointer.
- ModelPolicyValidation: candidate fingerprint and preflight result; publication requires matching successful validation within 30 minutes and the expected current version.
- ModelPolicyJob: durable version binding, including pre-activation jobs with null central versions.
- ModelOperation: asset analysis claim, upstream references and result, without credentials.
- ModelExecutionLog: system, task, connection, target model, reported response model, version, status and latency.

Set MODEL_CONFIG_ENCRYPTION_KEY on Kanban to 64 hexadecimal characters representing a random 32-byte infrastructure key. Back it up securely. Changing it without re-encryption makes historical connections unreadable. Provider-key rotation creates new connection/catalog versions; old jobs retain the old connection.

Internal model-runtime endpoints require CONTENT_SERVICE_INTERNAL_TOKEN and protocol version 2. Credentials are delivered only to authenticated backends. Public metadata is an allowlist without secrets. Jobs store references, never provider keys. Content uses bounded, expiring in-memory credential caching.

## Release

1. Run `npx prisma migrate deploy`, then `npx prisma migrate status`. Do not create these tables through db push or separately execute migration SQL. If an operator already executed the exact migration manually, verify schema equality before `migrate resolve --applied`.
2. Deploy all three consumers with the central pointer still null. Existing routing continues during staging.
3. Configure Kanban's encryption key, service URLs, and the same CONTENT_SERVICE_INTERNAL_TOKEN in all three systems. Content needs AMC_KANBAN_INTERNAL_URL; MM needs its existing Kanban origin. MM preflight HTTP 401 means shared authentication failed.
4. Inventory/import and review the redacted report. Resolve active-route conflicts, missing credentials and capability warnings before activation. Import does not activate. Basic video has its own content:basic_video_generation exception. Existing asset analysis retains its CN Gateway connection.
5. Select Kopix glm-5.3 for text and review media defaults/exceptions. Run real text/JSON/conversation/tool checks and three-system preflight. Media preflight checks adapters, declared limits and advertised gateway capabilities; it does not replace live media business acceptance.
6. Publish with version comparison. Start a new text request in each system and a minimal business task for every enabled media capability; inspect actual results and versioned logs. A response model name is provider-reported metadata, not independent proof of the underlying weights.
7. Retain historical connection versions and legacy media secrets until the in-flight inventory drains. Then remove obsolete deployment variables. Do not remove gateway-internal provider keys.

Voice identities belong to provider accounts. Selecting a different account can require enrolling the voice again. Unsupported private protocols, authentication formats and media executors require adapters; declaring a capability alone cannot create an executor.

## Local verification

Kanban/Content: `npm run test:unified-models`. All three: `npm run test:global-text`. Content: full `npm run test:integration` plus relevant media lifecycle tests. Run type checks and production builds. Tests use local policies and mock transports; Kanban registry tests execute the actual migration and transactions in PGlite. Passing tests does not establish production activation.
