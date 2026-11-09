import { mediaDigest } from "./post-contract";
export type VideoActor = { userId: string; authVersion?: number };
export type Receipt = { id: string; value: any; created?: boolean };
export type VideoDependencies = {
  authorize(
    actor: VideoActor,
    brandId: string,
    permission: string,
  ): Promise<void>;
  content(
    actor: VideoActor,
    method: string,
    path: string,
    body: any,
  ): Promise<any>;
  reserve(key: string, fingerprint: string, value: any): Promise<Receipt>;
  get(id: string): Promise<Receipt | null | undefined>;
  lookup(key: string): Promise<Receipt | null | undefined>;
  save(id: string, value: any): Promise<void>;
  posts?: {
    call(a: VideoActor, name: string, input: any): Promise<any>;
    preview(a: VideoActor, id: string): Promise<any>;
    confirm(a: VideoActor, id: string): Promise<any>;
    remember(a: VideoActor, b: string, id: string, input: any): Promise<void>;
    attachRemembered(a: VideoActor, b: string, id: string): Promise<any>;
    forVideo(a: VideoActor, b: string, id: string): Promise<any>;
  };
  origin: string;
  now(): number;
};
const hash = mediaDigest;
const fail = (code: string, status = 409): never => {
  throw Object.assign(new Error(code), { status });
};
/** Content/job progress and signed URLs are intentionally not revision inputs. */
export function projectRevision(p: any) {
  return hash({
    id: p.id,
    title: p.title,
    brandId: p.brandId,
    createdBy: p.createdBy,
    objective: p.objective,
    language: p.language,
    platform: p.platform,
    aspectRatio: p.aspectRatio,
    referenceAssetIds: p.referenceAssetIds,
    audioSettings: p.audioSettings,
    scriptVersion: p.scriptVersion,
    input: p.input,
    shots: (p.shots || []).map((s: any) => ({
      shotId: s.shotId,
      prompt: s.prompt,
      durationSec: s.durationSec,
      spokenText: s.spokenText,
      subtitle: s.subtitle,
      voiceoverText: s.voiceoverText,
      captionMode: s.captionMode,
      overlayText: s.overlayText,
      selectedClipJobId: s.selectedClipJobId,
      selectedVoiceoverMediaId: s.selectedVoiceoverMediaId,
      generationRevision: s.generationRevision,
    })),
    finalInvalidatedAt: p.finalInvalidatedAt,
    assemblyId: p.assemblyJob?.id,
  });
}
const pathFor = (id: string) =>
  "/v1/lab/basic-video/drafts/" + encodeURIComponent(id);
export function createVideoAssistant(d: VideoDependencies) {
  async function read(actor: VideoActor, brandId: string, id: string) {
    await d.authorize(actor, brandId, "content.video-making.read");
    const p = await d.content(
      actor,
      "GET",
      pathFor(id) + "?" + new URLSearchParams({ brandId }),
      { brandId },
    );
    if (p?.id !== id || p.brandId !== brandId || p.createdBy !== actor.userId)
      fail("video_not_found", 404);
    return p;
  }
  function project(p: any) {
    return JSON.parse(
      JSON.stringify({
        ok: true,
        projectId: p.id,
        brandId: p.brandId,
        revision: projectRevision(p),
        title: p.title,
        brief: p.objective,
        assets: p.selectedAssets || [],
        referenceAssetIds: p.referenceAssetIds || [],
        status: p.status,
        progress: p.progress || null,
        shots: (p.editableShots || p.shots || []).map((s: any) => ({
          shotId: s.shotId,
          prompt: s.prompt,
          durationSec: s.durationSec,
          spokenText: s.spokenText ?? s.voiceoverText,
          subtitle: s.subtitle,
        })),
        lastError: p.lastError || null,
        assemblyStatus: p.assemblyJob?.status || null,
        libraryState: p.libraryState,
        instructions:
          "Use projectId to continue this task. A created draft or submitted provider job is not a finished video. Request final review after assembly completes; downloads require that review.",
      }),
    );
  }
  async function durable(
    actor: VideoActor,
    brandId: string,
    op: string,
    key: string,
    input: any,
    work: () => Promise<any>,
  ) {
    const row = await d.reserve(
      hash([actor.userId, brandId, op, key]),
      hash(input),
      {
        userId: actor.userId,
        brandId,
        state: "reconciliation_required",
        operation: op,
        projectId: input.projectId || null,
      },
    );
    if (!row.created)
      return (
        row.value.result || {
          ok: false,
          state: "reconciliation_required",
          requestId: row.id,
          projectId: row.value.projectId,
          instructions:
            "Read the original project/receipt. Do not resubmit an uncertain write.",
        }
      );
    try {
      const result = await work();
      await d.save(row.id, { ...row.value, state: "returned", result });
      return result;
    } catch (error) {
      // Transport timeouts and provider failures can have a real effect. Preserve the reservation.
      const status = (error as any)?.status;
      if (status && [400, 401, 403, 404, 409, 422].includes(status)) {
        await d.save(row.id, {
          ...row.value,
          state: "failed",
          result: {
            ok: false,
            state: "failed",
            error: (error as Error).message,
          },
        });
        throw error;
      }
      return {
        ok: false,
        state: "reconciliation_required",
        requestId: row.id,
        projectId: input.projectId || null,
        instructions:
          "Outcome uncertain. Read the original project; do not automatically repeat.",
      };
    }
  }
  async function requestApproval(
    actor: VideoActor,
    input: any,
    kind: "generation" | "final",
  ) {
    const p = await read(actor, input.brandId, input.projectId);
    if (projectRevision(p) !== input.expectedRevision)
      fail("video_revision_conflict");
    let quote: any = null;
    if (kind === "generation") {
      quote = await d.content(actor, "POST", pathFor(p.id) + "/estimate", {
        brandId: input.brandId,
      });
      if (
        !Number.isFinite(quote?.amcCredit?.amount) ||
        quote.amcCredit.amount < 0 ||
        quote.amcCredit.unit !== "AMC Credit"
      )
        fail("video_credit_estimate_unavailable", 422);
      if (
        quote?.breakdown?.pricingConfigured !== true ||
        !Number.isFinite(quote?.confirmation?.estimatedAmount) ||
        quote.confirmation.estimatedAmount < 0 ||
        !quote.confirmation.id ||
        !(Date.parse(quote.confirmation.expiresAt) > d.now())
      )
        fail("video_pricing_unavailable", 422);
    } else if (
      p.finalInvalidatedAt ||
      p.assemblyJob?.status !== "completed" ||
      !p.assemblyJob.outputs?.some((o: any) => o.mimeType?.startsWith("video/"))
    )
      fail("video_not_ready");
    const value = {
      userId: actor.userId,
      brandId: input.brandId,
      projectId: p.id,
      kind,
      state: "awaiting_input",
      revision: projectRevision(p),
      quote,
      expiresAt:
        kind === "generation"
          ? quote.confirmation.expiresAt
          : new Date(d.now() + 15 * 60 * 1000).toISOString(),
    };
    const approval = await d.reserve(
      hash(["approval", actor.userId, input.brandId, kind, input.requestKey]),
      hash({ projectId: p.id, revision: value.revision }),
      value,
    );
    return {
      ok: true,
      state: "awaiting_input",
      projectId: p.id,
      revision: value.revision,
      approvalId: approval.id,
      confirmationUrl:
        d.origin +
        "/video-assistant/confirm/" +
        encodeURIComponent(approval.id),
      estimate: quote
        ? { ...quote.confirmation, amcCredit: quote.amcCredit }
        : null,
      instructions:
        kind === "generation"
          ? "Ask the user to open confirmationUrl and review this script/materials and price. Only the signed-in human can start generation; never claim it has started."
          : "Ask the user to open confirmationUrl, watch the current video and approve it. Never approve for the user.",
    };
  }
  async function call(actor: VideoActor, name: string, input: any) {
    if (name === "video_prepare_post" || name.startsWith("post_")) {
      if (!d.posts) fail("post_service_unavailable", 503);
      return d.posts!.call(actor, name, input);
    }
    const permission =
      name === "video_create_draft" || name === "video_revise_draft"
        ? "create"
        : name === "video_stop" || name === "video_request_review"
          ? "update"
          : name === "video_request_generation"
            ? "generate"
            : "read";
    await d.authorize(
      actor,
      input.brandId,
      "content.video-making." + permission,
    );
    if (name === "video_get_project") {
      const p = await read(actor, input.brandId, input.projectId);
      return {
        ...project(p),
        ...(d.posts
          ? { posts: await d.posts.forVideo(actor, input.brandId, p.id) }
          : {}),
      };
    }
    if (name === "video_list_projects") {
      const result = await d.content(
        actor,
        "GET",
        "/v1/lab/basic-video/drafts?" +
          new URLSearchParams({ brandId: input.brandId, limit: "50" }),
        { brandId: input.brandId },
      );
      return {
        ok: true,
        items: (result.items || [])
          .filter(
            (p: any) =>
              p.brandId === input.brandId && p.createdBy === actor.userId,
          )
          .map(project),
        instructions:
          "Only this first page is returned; missing items are not evidence that no other projects exist.",
      };
    }
    if (name === "video_get_output") {
      const p = await read(actor, input.brandId, input.projectId);
      if (
        p.libraryState !== "completed" ||
        p.finalInvalidatedAt ||
        p.assemblyJob?.status !== "completed"
      )
        fail("video_final_review_required");
      const outputs = [];
      for (const o of p.assemblyJob.outputs || []) {
        if (!o.mimeType?.startsWith("video/")) continue;
        outputs.push({
          id: o.id,
          mimeType: o.mimeType,
          download: {
            url:
              d.origin +
              "/api/video-assistant/output?" +
              new URLSearchParams({
                brandId: input.brandId,
                projectId: p.id,
                mediaId: o.id,
              }),
          },
        });
      }
      if (!outputs.length) fail("video_output_unavailable");
      return {
        ok: true,
        projectId: p.id,
        status: "completed",
        assetId: p.libraryAssetId,
        outputs,
        instructions:
          "Download requires the same signed-in user or personal API credential. Access is rechecked on every request. Completion is not social publication.",
      };
    }
    return durable(
      actor,
      input.brandId,
      name,
      input.requestKey,
      input,
      async () => {
        if (name === "video_create_draft" || name === "video_revise_draft") {
          if (name === "video_revise_draft") {
            const old = await read(actor, input.brandId, input.projectId);
            if (projectRevision(old) !== input.expectedRevision)
              fail("video_revision_conflict");
          }
          const p = await d.content(
            actor,
            "POST",
            "/v1/lab/basic-video/drafts",
            {
              brandId: input.brandId,
              requestKey: input.requestKey,
              creationMode: "text",
              generationMode: "timeline",
              autoSelectReferences: false,
              prompt: input.prompt,
              title: input.title || "营销视频",
              platform: input.platform,
              language: input.language,
              aspectRatio: input.aspectRatio,
              targetDurationSec: input.durationSec,
              referenceAssetIds: input.assetIds,
              productionOptions: { voiceMode: "model", subtitlesEnabled: true },
            },
          );
          if (
            !p?.id ||
            p.brandId !== input.brandId ||
            p.createdBy !== actor.userId
          )
            fail("video_invalid_creation_receipt", 502);
          if (input.publication) {
            if (!d.posts) fail("post_service_unavailable", 503);
            await d.posts!.remember(
              actor,
              input.brandId,
              p.id,
              input.publication,
            );
          }
          return {
            ...project(p),
            ...(name === "video_revise_draft"
              ? { supersedesProjectId: input.projectId }
              : {}),
            instructions:
              "Draft created, not rendered. Review the script and materials, then call video_request_generation with the current revision. Revisions create a successor draft and retain the original project.",
          };
        }
        if (name === "video_request_generation")
          return requestApproval(actor, input, "generation");
        if (name === "video_request_review")
          return requestApproval(actor, input, "final");
        if (name === "video_stop") {
          const p = await read(actor, input.brandId, input.projectId);
          if (projectRevision(p) !== input.expectedRevision)
            fail("video_revision_conflict");
          return {
            ok: true,
            projectId: p.id,
            result: await d.content(actor, "POST", pathFor(p.id) + "/stop", {
              brandId: input.brandId,
            }),
            instructions:
              "Stop requested. Already accepted provider work may still finish; no automatic refund is promised.",
          };
        }
        fail("video_tool_unavailable", 422);
      },
    );
  }
  async function confirmation(actor: VideoActor, id: string, validate = true) {
    const row = await d.get(id),
      v = row?.value;
    if (
      !v ||
      v.userId !== actor.userId ||
      !["generation", "final"].includes(v.kind)
    )
      fail("video_confirmation_not_found", 404);
    await d.authorize(
      actor,
      v.brandId,
      "content.video-making." + (v.kind === "final" ? "update" : "generate"),
    );
    const p = await read(actor, v.brandId, v.projectId);
    if (validate && projectRevision(p) !== v.revision)
      fail("video_revision_conflict");
    if (validate && !(Date.parse(v.expiresAt) > d.now()))
      fail("video_confirmation_expired");
    return { row: row!, value: v, project: p };
  }
  async function preview(actor: VideoActor, id: string) {
    const receipt = await d.get(id);
    if (receipt?.value?.kind === "publication" && d.posts)
      return d.posts.preview(actor, id);
    const { row, value: v, project: p } = await confirmation(actor, id, false);
    const execution = await d.lookup(
      hash([actor.userId, v.brandId, "human_" + v.kind, id]),
    );
    if (!execution) await confirmation(actor, id);
    return {
      execution:
        execution?.value?.result ||
        (execution ? { state: "reconciliation_required" } : null),
      id: row.id,
      kind: v.kind,
      expiresAt: v.expiresAt,
      estimate: v.quote
        ? { ...v.quote.confirmation, amcCredit: v.quote.amcCredit }
        : null,
      project: project(p),
      previews:
        v.kind === "final"
          ? (p.assemblyJob?.outputs || [])
              .filter((o: any) => o.mimeType?.startsWith("video/"))
              .map((o: any) => ({
                id: o.id,
                url:
                  d.origin +
                  "/api/video-assistant/output?" +
                  new URLSearchParams({ approvalId: id, mediaId: o.id }),
              }))
          : [],
      instructions:
        "Confirm only if the script, material rights, brand facts and price/current video are correct.",
    };
  }
  async function confirm(actor: VideoActor, id: string) {
    const row = await d.get(id),
      v = row?.value;
    if (v?.kind === "publication" && d.posts) return d.posts.confirm(actor, id);
    if (
      !v ||
      v.userId !== actor.userId ||
      !["generation", "final"].includes(v.kind)
    )
      fail("video_confirmation_not_found", 404);
    await d.authorize(
      actor,
      v.brandId,
      "content.video-making." + (v.kind === "final" ? "update" : "generate"),
    );
    await read(actor, v.brandId, v.projectId);
    return durable(
      actor,
      v.brandId,
      "human_" + v.kind,
      id,
      { projectId: v.projectId, revision: v.revision },
      async () => {
        // Recheck immediately before dispatch. Content also binds confirmationId to its current inputHash.
        await confirmation(actor, id);
        const result = await d.content(
          actor,
          "POST",
          pathFor(v.projectId) +
            (v.kind === "generation" ? "/generate" : "/confirm"),
          {
            brandId: v.brandId,
            ...(v.kind === "generation"
              ? { confirmationId: v.quote.confirmation.id }
              : {}),
          },
        );
        const postHandoff =
          v.kind === "final" && d.posts
            ? await d.posts.attachRemembered(actor, v.brandId, v.projectId)
            : null;
        return {
          ok: true,
          postHandoff,
          projectId: v.projectId,
          state: v.kind === "generation" ? "submitted" : "approved",
          result: v.kind === "generation" ? project(result) : result,
          instructions:
            v.kind === "generation"
              ? "Generation accepted. Read the original project for actual progress and final review."
              : "Final review recorded. Retrieve the approved output with video_get_output.",
        };
      },
    );
  }
  async function downloadTarget(
    actor: VideoActor,
    input: {
      brandId?: string;
      projectId?: string;
      approvalId?: string;
      mediaId: string;
    },
  ) {
    let p: any;
    if (input.approvalId) {
      const c = await confirmation(actor, input.approvalId);
      if (c.value.kind !== "final") fail("video_review_required");
      p = c.project;
    } else {
      if (!input.brandId || !input.projectId) fail("video_not_found", 404);
      p = await read(actor, input.brandId!, input.projectId!);
      if (p.libraryState !== "completed") fail("video_final_review_required");
    }
    if (
      p.finalInvalidatedAt ||
      p.assemblyJob?.status !== "completed" ||
      !p.assemblyJob.outputs?.some(
        (o: any) => o.id === input.mediaId && o.mimeType?.startsWith("video/"),
      )
    )
      fail("video_output_unavailable");
    return {
      brandId: p.brandId,
      path: `/v1/lab/basic-video/drafts/${encodeURIComponent(p.id)}/assembly-jobs/${encodeURIComponent(p.assemblyJob.id)}/outputs/${encodeURIComponent(input.mediaId)}/download`,
    };
  }
  return { call, preview, confirm, downloadTarget };
}
