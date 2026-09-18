# Merchant voiceover implementation contract

Status: implemented locally; production migration, deployment and merchant-sample acceptance pending.

MM records/uploads authorized MP3/M4A/WAV audio, 10–300 seconds, at most 20,000,000 bytes. Durable VoiceTask jobs use idempotency keys, database leases and restart recovery. Source recordings are private OBS objects. Only successful clone plus activation TTS marks a voice ready. Arbitrary recordings never use the preview sentence as text_validation. All MiniMax speech requests use https://api.minimaxi.com only and reject other origins or redirects. Each request uses one configuration and never falls back to another key. Custom voices bind their original configuration. Existing unbound voices require verification before reuse.

The first ready voice becomes default; renaming preserves default. Dedicated brand voice endpoints own all profile writes; brand-scoped transactions serialize updates. Template and historical MM video flows retain their narration settings. New free generation uses Content Normal mode and video-model native audio only; it does not expose a voice selector or call standalone TTS. Jobs snapshot voice/configuration and narration. Kanban persists each generated segment; MM passes audio URLs into Content assembly. Retries reuse successful segments and shots. Complete narration is preserved with at most two seconds of final-frame extension per shot, shifted subtitles and reduced music. Video providers and assistant voices remain unchanged.

Deployment order: VoiceTask migration and OBS configuration, Kanban Node worker, Content, MM. Verify invalid audio, activation failures, duplicate/restarted jobs, cross-brand injection, concurrent/default edits, four voice choices and retry reuse. Production acceptance requires one authorized test-brand recording-to-final-video run.

Upload checks both HTTP and MiniMax business status. Provider code and message remain visible on rejection. File IDs are preserved as decimal strings in task payloads and sent as exact JSON integers to cloning; they must never pass through a lossy JavaScript number.

## Interfaces and recovery

- `POST /api/brands/:id/voices`: multipart `file`, `label`, `role`, `speakerName`, `consentConfirmed=true`, `requestKey` (8–100 alphanumeric/underscore/hyphen characters). Returns 202 with `taskId`, profiles and default ID. `GET` restores persisted status. `PATCH /voices/:profileId` accepts label/role/default or `retry:true`; arbitrary status changes are rejected. DELETE disables.
- `POST /api/brands/:id/voiceover-tasks`: `action:resolve` accepts brandVoiceProfileId or the controlled systemVoiceId; `action:validate` verifies a stored selection; otherwise requestKey, resolved selection and narration segments enqueue work. GET with task ID returns state, errors and fresh signed audio URLs. All operations require brand write access.
- MM video jobs store their voice snapshot and progress in `VideoProductionJob.voiceoverState`. Historical jobs retain their recorded narration decision. New free-generation requests disable standalone narration; template requests retain their existing audio settings. Ready unbound legacy voices need re-recording; they cannot silently switch accounts.
- `VoiceTask` is scanned every five seconds by the Kanban Node instrumentation worker. A ten-minute database lease prevents concurrent execution; each persisted stage/segment renews it. Expired leases resume after restart. A successful clone is checkpointed before activation; an uncertain clone is queried and the same ID is activated because inactive voices do not appear in get_voice. A missing list entry never triggers a blind new clone.
- Samples use private OBS ACLs, signed origin reads and an anonymous-access check. Completed clone source objects are deleted. Failed-source objects remain private to permit explicit retries. Generated narration is private; result URLs expire after one hour and are renewed on task lookup. OBS configuration remains infrastructure configuration; no AI keys are copied to the client.

## Release checks

1. Apply `20260909090000_add_voice_tasks` with `prisma migrate deploy` to the selected environment, after the pre-existing voice-profile migration. Regenerate Prisma before building.
2. Configure the existing enabled MiniMax TTS profile in Kanban admin. The cloning and TTS endpoints derive from this same profile origin. Changing its credentials or origin invalidates previous bindings until a voice is recorded again.
3. Verify OBS denies anonymous access to voice objects and the Node worker is running. Monitor VoiceTask status/error/leaseUntil and `[merchant-voice-worker]` logs. MM/Content service URLs and tokens must already be configured.
4. Deploy Kanban first, Content's assembly parameter forwarding second, MM last. Rollback the applications together; keep additive database columns/tables. Pausing the new worker preserves queued work for a later rollout.
5. Use an authorized merchant sample for cloning, preview and a final single-shot and multi-shot video. This billable provider/account and storage acceptance was not performed locally.

Local checks: `npx tsx scripts/test-merchant-voice.mts` (Kanban), `npx tsx scripts/test-merchant-video-voice.mts` (MM), typechecks and builds; Content `npm run test:basic-video-voice-timing` performs real FFmpeg audio/video timing checks. UI fixture checks use the actual VideoVoiceSelector component with mocked brand responses, not a production merchant session.

MiniMax reference: https://platform.minimax.io/docs/api-reference/voice-cloning-clone and https://platform.minimax.io/docs/api-reference/voice-management-get (inactive voices are absent until first successful synthesis).
