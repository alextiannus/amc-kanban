# PRD: AMC AI Video Creator

## 1. Problem Statement

AMC merchants already upload product photos, store photos, menu screenshots, review screenshots, and short clips, but turning those assets into publishable videos is still a manual operator workflow. This creates delay between asset collection and campaign output, especially for merchants who need TikTok/Reels/Google Business video updates but do not have in-house video editing capacity.

The cost of not solving this is that AMC remains strong at copywriting and scheduling, but weaker at the highest-engagement content format: short video. Video creation must become a structured workflow that is simple for merchants, controllable for operators, and auditable for PSG/customer reporting.

## 2. Goals

- Reduce time from selected assets to first video storyboard to under 60 seconds.
- Let operators create a Seedance-ready video plan from selected `MediaAsset` records without manually copying URLs.
- Support at least two v1 merchant workflows: product showcase and story campaign.
- Persist video model/provider credentials in `amc-kanban` `LLMConfig`, not environment-only keys.
- Produce video plans that can later become tasks, generated assets, scheduled drafts, and usage report evidence.

## 3. Non-Goals

- V1 does not ship a full node editor. GitHub projects like ComfyUI prove the power of node workflows, but AMC merchants need task-based creation first.
- V1 does not directly publish generated videos to social platforms. Publishing remains the existing calendar/draft workflow.
- V1 does not guarantee final provider rendering for every model. The first implementation returns reviewable storyboard and provider job payloads before full async queue execution.
- V1 does not expose raw prompt engineering controls to merchants. Advanced controls stay internal.

## 4. User Stories

- As an AMC operator, I want to select multiple assets in the asset library and start AI video creation so that I can quickly turn approved materials into a campaign video.
- As a brand owner, I want to choose a clear video goal such as product showcase or offer promotion so that I do not need to understand video model prompts.
- As an operator, I want to review scenes, overlays, voiceover text, and Seedance job payloads before rendering so that brand claims and pricing stay accurate.
- As an admin, I want to configure Seedance/Kie/Fal/Volcengine video providers in `LLMConfig` so that video model keys are persisted and auditable.
- As a customer success user, I want generated video work to become reportable evidence so that monthly usage reports show concrete marketing output.

## 5. Requirements

### P0 Must-Have

- `amc-content` owns video intelligence: creator profiles, storyboard generation, Seedance-ready job plans, and assembly plans.
- `amc-kanban` exposes `/api/content/video/create` to authenticate users, check brand access, and call `amc-content`.
- `amc-kanban` asset library bottom action bar shows `AI生视频` after one or more assets are selected.
- `amc-kanban` provides a video creator page that accepts `brandId` and selected `assetIds`, lets the user pick creator type, and previews storyboard output.
- `LLMConfig` supports persistent video provider configs with task tags such as `video_generation` and `image_to_video`.
- Existing `video-director` Kie.ai path must read provider key/model/baseUrl from `LLMConfig`, not `KIEAI_API_KEY`.

Acceptance criteria:

- Given selected media assets in the asset library, when the user clicks `AI生视频`, then the app opens `/dashboard/video` with the selected `assetIds`.
- Given a valid brand and selected assets, when the user submits the video creator form, then kanban calls `amc-content /v1/video/create` and displays scene output.
- Given an admin creates a video provider config with `taskTags=['video_generation']`, when they save it, then the config persists without chat-completion validation.

### P1 Nice-to-Have

- Persist `VideoProductionJob` records in kanban with status: `planned`, `submitted`, `rendering`, `ready`, `failed`, `approved`, `scheduled`.
- Add provider adapter for Seedance 2.0 async task creation, polling, and result URL storage, with provider credentials read from `LLMConfig`.
- Create generated `MediaAsset` records for finished videos with source type `ai_video`.
- Add operator queue view for retry, regenerate, approve, and attach-to-draft.
- Add `review_to_video` and `event_offer` as merchant-facing templates.

### P2 Future

- Multi-clip stitching worker using FFmpeg/Remotion.
- Per-brand reusable video templates.
- Auto-create monthly report videos from usage reports.
- A simplified `amc-mm` merchant UI with one obvious next action and no model terminology.
- Optional advanced internal workflow builder inspired by node-based tools.

## 6. UX Direction

### amc-content

No merchant UI. It returns structured creator profiles, scenes, provider jobs, and assembly plans.

### amc-kanban

Operator control surface:

- asset library entry point;
- video creator workbench;
- storyboard review;
- provider status;
- generated asset persistence;
- draft/calendar handoff.

### amc-mm

Merchant-facing simplified flow:

- choose `Create Video`;
- pick one task: product, offer, review, story;
- select approved materials;
- review plain-language storyboard;
- submit for AMC production.

## 7. GitHub UIUX References

- GitHub Topics sorted by stars shows `OpenMontage` at 39.4k stars as an agentic video production system with multiple pipelines and tools; useful reference for treating video as a production workflow, not just a prompt box. Source: https://github.com/topics/text-to-video
- ComfyUI has 121k stars and describes itself as a modular diffusion GUI/API/backend with a graph/nodes interface; useful for internal workflow graph thinking, but too complex for merchants. Source: https://github.com/comfyanonymous/ComfyUI
- InvokeAI highlights an industry-leading web UI, unified canvas, and workflow/node management; useful for balancing professional controls with usable UI. Source: https://github.com/invoke-ai/InvokeAI
- LTX-Video documents image-to-video, multi-keyframe conditioning, video extension, synchronized audio/video, and ComfyUI integration; useful for planning future multi-keyframe and audio support. Source: https://github.com/Lightricks/ltx-video
- ComfyUI-AnimateDiff-Evolved shows how video workflows depend on helper suites, control inputs, context windows, and example workflows; useful for future operator-only advanced mode. Source: https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved

## 8. Success Metrics

- 50% of operator-created video plans use selected asset library assets within 30 days of launch.
- Median time from asset selection to generated storyboard under 60 seconds.
- At least 30% of generated storyboards are approved or sent to render within 7 days.
- At least 10 finished AI video assets are created for pilot brands in the first month after provider rendering ships.
- Support tickets for "how do I make a video from these photos" decrease after merchant-facing `amc-mm` entry launches.

## 9. Open Questions

- Engineering: Seedance is the default production direction. Confirm whether first adapter uses BytePlus ModelArk directly or a temporary relay, but keep provider credentials in `LLMConfig`.
- Engineering: Should generated video binaries be stored in OBS immediately, or first kept at provider URLs then imported?
- Product: Should brand owners directly render videos, or should they only submit storyboard requests for operator approval?
- Legal/Compliance: What approval copy is needed when using customer reviews as video overlays?
- Finance: Do we meter video generation per subscription tier or treat it as operator-managed service work?

## 10. Timeline

- Phase 1: Storyboard planning and UI entry: asset selection to video creator page.
- Phase 2: Provider config and async rendering queue.
- Phase 3: Generated video asset persistence and draft/calendar handoff.
- Phase 4: Merchant-facing `amc-mm` simplified creation flow.
- Phase 5: Report videos and recurring campaign templates.
