import { prisma } from "../prisma";
import { sanitizePostFastDraftControls } from "../integrations/postfast";
import { lockBrandSync } from "../socialAccountLocks";
import { readCreativeRevisions } from "../brand-plan/creativeRevisions";
import { getSchedulingRecommendations } from "../schedulingRecommendation";
import { validateDraftMediaForPlatform } from "../publishMediaValidation";
import { blockingMediaIssues } from "../mediaValidation";
import { checkPostfastPublishAccount } from "../postfastPublishAccount";
import { submitDraftForDelivery } from "../draftSubmission";
import { videoReceipts } from "./receipt-store";
import {
  mediaDigest,
  postRevision,
  postContentRevision,
  postInclude,
} from "./post-contract";
import { projectRevision, type VideoActor } from "./core";
const fail = (code: string, status = 409): never => {
  throw Object.assign(Error(code), { status });
};
const safeError = (e: unknown) =>
  e instanceof Error ? e.message : "post_handoff_unavailable";
type Deps = {
  authorize: (a: VideoActor, b: string, p: string) => Promise<unknown>;
  origin: string;
  readVideo: (a: VideoActor, b: string, id: string) => Promise<any>;
  submit?: typeof submitDraftForDelivery;
  schedule?: typeof getSchedulingRecommendations;
};
export function createPostAssistant(deps: Deps) {
  const auth = deps.authorize;
  async function account(
    actor: VideoActor,
    brandId: string,
    id: string,
    db: any = prisma,
  ) {
    const a = await db.socialAccount.findFirst({
      where: { id, brandId, unboundAt: null },
    });
    if (!a || a.handle === "unconfigured" || !a.platformId)
      fail("post_account_unavailable", 422);
    return a;
  }
  async function read(
    actor: VideoActor,
    brandId: string,
    id: string,
    db: any = prisma,
  ) {
    await auth(actor, brandId, "draft.read");
    const d = await db.contentDraft.findFirst({
      where: { id, brandId },
      include: postInclude,
    });
    if (!d) fail("post_not_found", 404);
    return d;
  }
  const present = (d: any) => ({
    ok: true,
    brandId: d.brandId,
    draftId: d.id,
    revision: postRevision(d),
    caption: d.caption,
    hashtags: d.hashtags,
    postfastControls: d.postfastControls,
    instagramPublishType: d.instagramPublishType,
    gbpLocationId: d.gbpLocationId,
    coverUrl: d.coverAsset?.url || null,
    account: d.account
      ? {
          id: d.account.id,
          platformId: d.account.platformId,
          displayName: d.account.displayName || d.account.handle,
          handle: d.account.handle,
        }
      : null,
    status: d.status,
    scheduledAt: d.scheduledAt,
    publishedAt: d.publishedAt,
    postUrl: d.postUrl,
    deliveryFailureCode: d.deliveryFailureCode,
    videoProjectId:
      d.viralCopyScriptProvenance?.videoAssistant?.projectId || null,
    instructions:
      "A saved draft is not submitted or published. Request human submission confirmation; query this draft for actual delivery.",
  });
  async function validate(
    actor: VideoActor,
    brandId: string,
    input: any,
    db: any = prisma,
  ) {
    await auth(actor, brandId, input.draftId ? "draft.update" : "draft.create");
    await account(actor, brandId, input.accountId, db);
    if (input.draftId) {
      const d = await read(actor, brandId, input.draftId, db);
      if (postRevision(d) !== input.expectedDraftRevision)
        fail("post_revision_conflict");
      if (
        !["draft", "planned_unimplemented"].includes(d.status) ||
        d.platformPostId ||
        d.deliveryFailureCode
      )
        fail("post_not_editable");
    }
    if (input.source) {
      const s = input.source,
        view = await readCreativeRevisions(
          { id: actor.userId, type: "HUMAN" },
          brandId,
          s.month || "",
          s.creativeId,
          undefined,
          db,
        );
      if (view.expectedRevision !== s.expectedRevision)
        fail("post_creative_revision_conflict");
      const selected =
        (view.current as any)?.calendarSelection?.draftId ||
        (view.current as any)?.schedule?.draftId;
      if (selected && selected !== input.draftId)
        fail("post_source_draft_mismatch");
      return {
        creativeId: s.creativeId,
        month: view.month,
        expectedRevision: view.expectedRevision,
        revisionId: view.revisions[0]?.id || null,
        relationship: "user_linked_not_fidelity_proof",
      };
    }
    return null;
  }
  async function prepare(actor: VideoActor, input: any, video: any) {
    const brandId = input.brandId;
    if (
      video.id !== input.projectId ||
      video.brandId !== brandId ||
      video.createdBy !== actor.userId
    )
      fail("video_not_found", 404);
    if (projectRevision(video) !== input.expectedRevision)
      fail("video_revision_conflict");
    if (
      video.libraryState !== "completed" ||
      video.finalInvalidatedAt ||
      !video.libraryAssetId
    )
      fail("video_final_review_required");
    await auth(actor, brandId, input.draftId ? "draft.update" : "draft.create");
    const fingerprint = mediaDigest({
      projectId: video.id,
      revision: input.expectedRevision,
      accountId: input.accountId,
      caption: input.caption,
      hashtags: input.hashtags || [],
      draftId: input.draftId || null,
      source: input.source || null,
    });
    const id =
      input.draftId ||
      "video_post_" +
        mediaDigest([brandId, video.id, input.accountId]).slice(0, 40);
    const draft = await prisma.$transaction(async (tx: any) => {
      await lockBrandSync(tx, brandId, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      await tx.$queryRaw`SELECT id FROM "ContentDraft" WHERE id=${id} AND "brandId"=${brandId} FOR UPDATE`;
      if (input.source)
        await tx.$queryRaw`SELECT id FROM "BrandKnowledge" WHERE "brandId"=${brandId} FOR UPDATE`;
      const existing = await tx.contentDraft.findFirst({
        where: { id, brandId },
        include: postInclude,
      });
      if (
        existing?.viralCopyScriptProvenance?.videoAssistant?.fingerprint ===
        fingerprint
      ) {
        await account(actor, brandId, input.accountId, tx);
        return existing;
      }
      const source = await validate(actor, brandId, input, tx);
      if (existing && !input.draftId) fail("post_already_exists_use_revision");
      const asset = await tx.mediaAsset.findFirst({
        where: {
          id: video.libraryAssetId,
          brandId,
          mimeType: { startsWith: "video/" },
        },
      });
      if (!asset || !asset.url) fail("post_video_asset_unavailable", 422);
      const provenance = {
        ...(existing?.viralCopyScriptProvenance || {}),
        videoAssistant: {
          projectId: video.id,
          videoRevision: input.expectedRevision,
          assetId: asset.id,
          createdBy: actor.userId,
          accountId: input.accountId,
          fingerprint,
          source,
          publishingRequiresHumanConfirmation: true,
        },
      };
      const data = {
        accountId: input.accountId,
        caption: input.caption.trim(),
        hashtags: input.hashtags || [],
        captionLang: video.language || "zh",
        mediaUrls: [asset.url],
        status: "draft",
        scheduledAt: null,
        viralCopyScriptProvenance: provenance,
      };
      if (existing) await tx.contentDraft.update({ where: { id }, data });
      else
        await tx.contentDraft.create({
          data: {
            id,
            brandId,
            ...data,
            agentId: actor.userId,
            agentNote: source
              ? `brand-plan-calendar-item:${source.creativeId}`
              : "Approved assistant video; publication requires human confirmation.",
          },
        });
      await tx.contentAssetRef.deleteMany({ where: { draftId: id } });
      await tx.contentAssetRef.create({
        data: { draftId: id, assetId: asset.id, order: 0 },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          actorType: "HUMAN",
          action: "VIDEO_POST_PREPARED",
          resourceType: "ContentDraft",
          resourceId: id,
          metadata: { brandId, projectId: video.id, assetId: asset.id, source },
        },
      });
      return tx.contentDraft.findUniqueOrThrow({
        where: { id },
        include: postInclude,
      });
    });
    return present(draft);
  }
  async function remember(
    actor: VideoActor,
    brandId: string,
    projectId: string,
    input: any,
  ) {
    await validate(actor, brandId, input);
    await videoReceipts.reserve(
      mediaDigest(["post-binding", actor.userId, brandId, projectId]),
      mediaDigest(input),
      { userId: actor.userId, brandId, projectId, publication: input },
    );
  }
  async function attachRemembered(
    actor: VideoActor,
    brandId: string,
    id: string,
  ) {
    const row = await videoReceipts.lookup(
      mediaDigest(["post-binding", actor.userId, brandId, id]),
    );
    if (!row) return null;
    try {
      const video = await deps.readVideo(actor, brandId, id);
      return await prepare(
        actor,
        {
          ...(row.value as any).publication,
          brandId,
          projectId: id,
          expectedRevision: projectRevision(video),
        },
        video,
      );
    } catch (e) {
      return {
        ok: false,
        state: "needs_input",
        projectId: id,
        error: safeError(e),
        instructions:
          "Video is approved; keep it. Read the current draft/account and resolve the handoff without rerendering.",
      };
    }
  }
  async function call(actor: VideoActor, name: string, input: any) {
    if (name === "video_prepare_post")
      return prepare(
        actor,
        input,
        await deps.readVideo(actor, input.brandId, input.projectId),
      );
    let draft = await read(actor, input.brandId, input.draftId);
    if (name === "post_get_delivery") {
      const job = await prisma.postfastDeliveryJob.findFirst({
        where: { brandId: input.brandId, draftId: draft.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          attempts: true,
          lastErrorCode: true,
          updatedAt: true,
          postUrl: true,
          postfastPostId: true,
        },
      });
      return {
        ...present(draft),
        delivery: job,
        instructions:
          "Queued/scheduled is not published. Unknown delivery results require reconciliation; never automatically resubmit.",
      };
    }
    if (name !== "post_request_submission") fail("video_tool_unavailable", 422);
    if((draft.viralCopyScriptProvenance as any)?.dailyPublishing)return {ok:true,state:'awaiting_input',confirmationUrl:deps.origin+'/daily-publishing',instructions:'Review source rights, exact content/account/time on the daily inventory page. This tool cannot approve or publish.'};
    await auth(actor, input.brandId, "draft.submit");
    await auth(actor, input.brandId, "content.schedule");
    await auth(actor, input.brandId, "content.publish");
    if (postRevision(draft) !== input.expectedDraftRevision)
      fail("post_revision_conflict");
    if (
      !["draft", "pending_review"].includes(draft.status) ||
      draft.platformPostId ||
      draft.deliveryFailureCode
    )
      fail("post_not_submittable");
    if (sanitizePostFastDraftControls(draft.postfastControls).error)
      fail("post_controls_invalid", 422);
    const a = await account(actor, input.brandId, draft.accountId);
    const issues = await validateDraftMediaForPlatform({
      platform: a.platformId,
      mediaUrls: draft.mediaUrls,
      assetRefs: draft.assetRefs,
      coverAsset: draft.coverAsset,
    });
    if (blockingMediaIssues(issues).length)
      fail("post_media_validation_failed", 422);
    const brand = await prisma.brand.findUnique({
      where: { id: input.brandId },
      select: { postfastApiKey: true },
    });
    if (!brand?.postfastApiKey) fail("post_provider_unavailable", 422);
    const health = await checkPostfastPublishAccount({
      apiKey: brand.postfastApiKey,
      brandId: input.brandId,
      accountId: a.id,
      platform: a.platformId,
    });
    if (!health.success) fail(health.code, health.status);
    draft = await read(actor, input.brandId, input.draftId);
    if (postRevision(draft) !== input.expectedDraftRevision)
      fail("post_revision_conflict");
    const schedule = await (deps.schedule || getSchedulingRecommendations)({
      brandId: input.brandId,
      platform: a.platformId,
      urgency: "normal",
    });
    const scheduledAt = schedule.recommendations?.[0]?.recommendedAt;
    if (!scheduledAt || Date.parse(scheduledAt) <= Date.now())
      fail("post_schedule_unavailable", 503);
    const value = {
      kind: "publication",
      userId: actor.userId,
      brandId: input.brandId,
      draftId: draft.id,
      revision: postRevision(draft),
      scheduledAt,
      contentRevision: postContentRevision(draft),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    };
    const receipt = await videoReceipts.reserve(
      mediaDigest([
        "post-submit",
        actor.userId,
        input.brandId,
        input.requestKey,
      ]),
      mediaDigest({ draftId: draft.id, revision: value.revision }),
      value,
    );
    return {
      ok: true,
      state: "awaiting_input",
      draftId: draft.id,
      revision: value.revision,
      approvalId: receipt.id,
      confirmationUrl: deps.origin + "/video-assistant/confirm/" + receipt.id,
      instructions:
        "The user must review the exact account, content and schedule at confirmationUrl. The assistant cannot approve publication.",
    };
  }
  async function approval(actor: VideoActor, id: string) {
    const row = await videoReceipts.get(id),
      v = row?.value as any;
    if (!v || v.kind !== "publication" || v.userId !== actor.userId)
      fail("video_confirmation_not_found", 404);
    await auth(actor, v.brandId, "draft.submit");
    await auth(actor, v.brandId, "content.publish");
    await auth(actor, v.brandId, "content.schedule");
    const draft = await read(actor, v.brandId, v.draftId);
    return { row: row!, v, draft };
  }
  async function preview(actor: VideoActor, id: string) {
    const { v, draft } = await approval(actor, id),
      execution = await videoReceipts.lookup(
        mediaDigest(["post-confirm", actor.userId, id]),
      );
    if (
      !execution &&
      (postRevision(draft) !== v.revision ||
        Date.parse(v.expiresAt) <= Date.now())
    )
      fail("post_revision_conflict");
    return {
      kind: "publication",
      id,
      expiresAt: v.expiresAt,
      scheduledAt: v.scheduledAt,
      post: present(draft),
      execution:
        execution?.value &&
        ((execution.value as any).result || {
          state: "reconciliation_required",
        }),
      project: { title: "确认发布内容", shots: [], assets: [] },
      previews: (draft.assetRefs || [])
        .filter(
          (r: any) =>
            r.asset?.mimeType?.startsWith("video/") &&
            /^https:\/\//.test(r.asset.url),
        )
        .map((r: any) => ({ id: r.assetId, url: r.asset.url })),
      estimate: null,
    };
  }
  async function confirm(actor: VideoActor, id: string) {
    const { v, draft } = await approval(actor, id);
    const key = mediaDigest(["post-confirm", actor.userId, id]),
      old = await videoReceipts.lookup(key);
    if (old)
      return (
        (old.value as any).result || {
          ok: false,
          state: "reconciliation_required",
          draftId: v.draftId,
        }
      );
    if (
      postRevision(draft) !== v.revision ||
      Date.parse(v.expiresAt) <= Date.now() ||
      Date.parse(v.scheduledAt) <= Date.now()
    )
      fail("post_revision_conflict");
    const row = await videoReceipts.reserve(key, mediaDigest(v), {
      userId: actor.userId,
      brandId: v.brandId,
      draftId: v.draftId,
      state: "reconciliation_required",
    });
    if (!row.created)
      return (
        (row.value as any).result || {
          ok: false,
          state: "reconciliation_required",
          draftId: v.draftId,
        }
      );
    try {
      const result = await (deps.submit || submitDraftForDelivery)({
        brandId: v.brandId,
        draftId: v.draftId,
        actorId: actor.userId,
        forcePublish: true,
        approvedVideoPost: {
          revision: v.revision,
          scheduledAt: v.scheduledAt,
          contentRevision: v.contentRevision,
        },
      });
      const output = {
        ok: result.ok,
        state: result.ok ? "submitted" : "failed",
        draftId: v.draftId,
        result,
        instructions:
          "Submission/queue acceptance is not publication. Read post_get_delivery for the actual result.",
      };
      await videoReceipts.save(row.id, {
        userId: actor.userId,
        brandId: v.brandId,
        result: JSON.parse(JSON.stringify(output)),
      });
      return output;
    } catch {
      return {
        ok: false,
        state: "reconciliation_required",
        draftId: v.draftId,
        instructions:
          "Inspect the original delivery; never repeat a post with unknown outcome.",
      };
    }
  }
  async function forVideo(actor: VideoActor, brandId: string, id: string) {
    try {
      await auth(actor, brandId, "draft.read");
    } catch {
      return { available: false, reason: "draft_read_required" };
    }
    const rows = await prisma.contentDraft.findMany({
      where: {
        brandId,
        viralCopyScriptProvenance: {
          path: ["videoAssistant", "projectId"],
          equals: id,
        },
      },
      include: postInclude,
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    return {
      available: true,
      items: rows.map(present),
      partial: rows.length === 10,
    };
  }
  return { call, preview, confirm, remember, attachRemembered, forVideo };
}
