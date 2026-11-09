import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.ts";
import { processPostfastDeliveryQueue } from "../src/lib/postfastDelivery.ts";
import { videoAssistant } from "../src/lib/video-assistant/runtime.ts";
import { actorFor } from "../src/lib/ai-native/contract.ts";
import {
  listBusinessTools,
  callBusinessTool,
} from "../src/lib/ai-native/business-tools.ts";
import { createAmcMcpServer } from "../src/lib/partner/mcp/server.ts";
import { principalFromUser } from "../src/lib/auth-v2/types.ts";
import { createSessionToken } from "../src/lib/auth-v2/session.ts";
import { verifyAccessIdentity } from "../src/lib/role-permissions/token.ts";
import { POST as confirmRoute } from "../src/app/api/video-assistant/confirm/[id]/route.ts";
import { GET as outputRoute } from "../src/app/api/video-assistant/output/route.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert(database.pathname.startsWith("/amc_lineage_test_"));
const suffix = randomUUID(),
  userId = "video-user-" + suffix,
  brandId = "video-brand-" + suffix;
const roleId = "video-role-" + suffix;
const realFetch = global.fetch;
let renders = 0,
  creations = 0,
  failRender = false,
  postCreates = 0,
  unknownPost = false;
const project: any = {
  id: "basic_fixture_" + suffix,
  brandId,
  createdBy: userId,
  status: "draft",
  libraryState: "draft",
  title: "Fixture video",
  objective: "新品菜品特写",
  referenceAssetIds: [],
  input: { productionOptions: { voiceMode: "model", subtitlesEnabled: true } },
  shots: [{ shotId: "s1", prompt: "新品菜品特写", durationSec: 15 }],
};
global.fetch = async (input: any, init: any) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.origin === "https://api.postfa.st") {
    if (url.pathname === "/social-media/my-social-accounts")
      return Response.json([
        {
          id: "pf-fixture",
          platform: "TIKTOK",
          platformUsername: "fixture",
          isConnected: true,
          connectionStatus: "CONNECTED",
        },
      ]);
    if (url.pathname === "/file/get-signed-upload-urls")
      return Response.json({
        urls: [
          {
            uploadUrl: "https://upload.fixture.invalid/video",
            storageKey: "video/test.mp4",
          },
        ],
      });
    if (url.pathname === "/social-posts") {
      postCreates++;
      return Response.json(unknownPost ? {} : { postIds: ["pf-post-fixture"] });
    }
    throw Error("Unexpected provider path " + url.pathname);
  }
  if (url.origin === "https://media.fixture.invalid")
    return new Response(new Uint8Array(8), {
      headers: { "content-type": "video/mp4", "content-length": "8" },
    });
  if (url.origin === "https://upload.fixture.invalid") {
    await new Response(init.body).arrayBuffer();
    return new Response("", { status: 200 });
  }
  assert.equal(url.origin, "https://content.fixture.invalid");
  const headers = new Headers(init?.headers),
    identity = verifyAccessIdentity(headers.get("x-amc-access-identity"));
  assert.equal(identity?.sub, userId);
  assert.equal(identity?.brandId, brandId);
  assert.equal(headers.get("authorization"), "Bearer fixture-service-token");
  if (url.pathname.endsWith("/estimate"))
    return Response.json({
      confirmation: {
        id: randomUUID(),
        estimatedAmount: 0.5,
        currency: "USD",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      },
      breakdown: { pricingConfigured: true },
      amcCredit: {
        amount: 300,
        unit: "AMC Credit",
        chargePolicy: "reserve_settle_release",
      },
    });
  if (url.pathname.endsWith("/generate")) {
    renders++;
    if (failRender) throw Error("lost response");
    project.status = "processing";
    return Response.json(project);
  }
  if (url.pathname.endsWith("/confirm")) {
    project.libraryState = "completed";
    project.libraryAssetId = "library-final";
    return Response.json({ ok: true, assetId: "library-final" });
  }
  if (url.pathname.endsWith("/download"))
    return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
      headers: { "content-type": "video/mp4" },
    });
  if (url.pathname === "/v1/lab/basic-video/drafts" && init.method === "POST")
    creations++;
  if (url.pathname === "/v1/lab/basic-video/drafts" && init.method === "GET")
    return Response.json({
      items: [project, { ...project, id: "other", createdBy: "other-user" }],
    });
  return Response.json(project);
};
let client: Client | undefined,
  server: ReturnType<typeof createAmcMcpServer> | undefined;
try {
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: userId + "@example.invalid",
      type: "HUMAN",
      role: "ADMIN",
      password: "not-a-login-hash-local-fixture",
    },
    include: {
      businessRoles: true,
      owner: { include: { businessRoles: true } },
    },
  });
  await prisma.brand.create({
    data: {
      id: brandId,
      name: "Fixture brand",
      postfastApiKey: "fixture-no-real-provider-key",
    },
  });
  const account = await prisma.socialAccount.create({
    data: {
      brandId,
      platformId: "tiktok",
      handle: "fixture",
      postfastAccountId: "pf-fixture",
      connectionStatus: "CONNECTED",
    },
  });
  await prisma.mediaAsset.create({
    data: {
      id: "library-final",
      brandId,
      url: "https://media.fixture.invalid/preview.mp4",
      mimeType: "video/mp4",
      sizeBytes: 8,
      technicalMetadata: {
        kind: "video",
        mimeType: "video/mp4",
        sizeBytes: 8,
        width: 720,
        height: 1280,
        durationSeconds: 15,
        videoCodec: "h264",
        frameRate: 24,
      },
    },
  });
  const principal = principalFromUser(user, "session"),
    actor = { userId, authVersion: principal.authVersion };
  const catalog = await listBusinessTools(actorFor(brandId, userId), "video");
  assert.equal(catalog.tools.length, 11);
  assert(
    catalog.tools.every(
      (t) => !Object.hasOwn(t.inputSchema.properties || {}, "brandId"),
    ),
  );
  server = createAmcMcpServer(principal);
  client = new Client({ name: "external-assistant-fixture", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  const external = await client.callTool({
    name: "video_get_project",
    arguments: { brandId, projectId: project.id },
  });
  const native = await callBusinessTool(
    actorFor(brandId, userId),
    "video_get_project",
    { projectId: project.id },
  );
  assert.deepEqual(external.structuredContent, native.structuredContent);
  const createArgs = {
    requestKey: "shared-create-" + suffix,
    prompt: "授权菜品营销短片",
    assetIds: [],
    language: "zh",
    platform: "tiktok",
    durationSec: 15,
    aspectRatio: "9:16",
    publication: {
      accountId: account.id,
      caption: "测试新品视频，仅在本地隔离环境投递。",
    },
  };
  const nativeCreated = await callBusinessTool(
    actorFor(brandId, userId),
    "video_create_draft",
    createArgs,
  );
  const externalReplay = await client.callTool({
    name: "video_create_draft",
    arguments: { ...createArgs, brandId },
  });
  assert.deepEqual(
    nativeCreated.structuredContent,
    externalReplay.structuredContent,
  );
  assert.equal(
    creations,
    1,
    "two assistants share the same persisted creation receipt",
  );
  const revision = (external.structuredContent as any).revision;
  const request = {
    brandId,
    projectId: project.id,
    expectedRevision: revision,
    requestKey: "render-" + suffix,
  };
  const [one, two] = await Promise.all([
    videoAssistant.call(actor, "video_request_generation", request),
    videoAssistant.call(actor, "video_request_generation", request),
  ]);
  const settled = await videoAssistant.call(
    actor,
    "video_request_generation",
    request,
  );
  assert.equal(settled.state, "awaiting_input");
  assert.equal(
    [one, two].filter((r) => r.state === "awaiting_input").length >= 1,
    true,
  );
  assert.equal(renders, 0);
  const session = await createSessionToken({
      userId,
      type: "HUMAN",
      authVersion: principal.authVersion,
    }),
    context = { params: Promise.resolve({ id: settled.approvalId }) };
  const browserHeaders = {
    cookie: "session=" + session,
    origin: "https://amc.fixture.invalid",
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
  };
  const cross = await confirmRoute(
    new Request(
      "https://amc.fixture.invalid/api/video-assistant/confirm/" +
        settled.approvalId,
      {
        method: "POST",
        headers: {
          ...browserHeaders,
          origin: "https://evil.invalid",
          "sec-fetch-site": "cross-site",
        },
        body: '{"confirmed":true}',
      },
    ),
    context,
  );
  assert.equal(cross.status, 403);
  const key = await confirmRoute(
    new Request(
      "https://amc.fixture.invalid/api/video-assistant/confirm/" +
        settled.approvalId,
      {
        method: "POST",
        headers: { ...browserHeaders, authorization: "Bearer not-human" },
        body: '{"confirmed":true}',
      },
    ),
    context,
  );
  assert.equal(key.status, 403);
  const approve = () =>
    confirmRoute(
      new Request(
        "https://amc.fixture.invalid/api/video-assistant/confirm/" +
          settled.approvalId,
        { method: "POST", headers: browserHeaders, body: '{"confirmed":true}' },
      ),
      context,
    );
  const approved = await Promise.all([approve(), approve()]);
  assert(approved.every((r) => r.status === 200));
  assert.equal(renders, 1);
  // Repeated human confirmation uses the same persisted database receipt.
  const before = await prisma.auditLog.count({
    where: { actorId: userId, action: "VIDEO_ASSISTANT_RECEIPT" },
  });
  await videoAssistant.confirm(actor, settled.approvalId);
  assert.equal(renders, 1);
  assert.equal(
    await prisma.auditLog.count({
      where: { actorId: userId, action: "VIDEO_ASSISTANT_RECEIPT" },
    }),
    before,
  );
  const query = new URLSearchParams({
    brandId,
    projectId: project.id,
    mediaId: "m1",
  });
  const blocked = await outputRoute(
    new Request(
      "https://amc.fixture.invalid/api/video-assistant/output?" + query,
      { headers: { cookie: "session=" + session } },
    ),
  );
  assert.equal(blocked.status, 409);
  project.status = "complete";
  project.assemblyJob = {
    id: "assembly1",
    status: "completed",
    outputs: [
      {
        id: "m1",
        mimeType: "video/mp4",
        url: "https://media.fixture.invalid/preview.mp4",
      },
    ],
  };
  const current = await videoAssistant.call(actor, "video_get_project", {
    brandId,
    projectId: project.id,
  });
  const review = await videoAssistant.call(actor, "video_request_review", {
    brandId,
    projectId: project.id,
    expectedRevision: current.revision,
    requestKey: "review-" + suffix,
  });
  const finalResult = await videoAssistant.confirm(actor, review.approvalId);
  assert.equal(
    finalResult.postHandoff?.ok,
    true,
    "final human review creates the remembered bound post draft: " +
      JSON.stringify(finalResult),
  );
  const draftId = finalResult.postHandoff.draftId;
  const post = await callBusinessTool(
    actorFor(brandId, userId),
    "post_get_delivery",
    { draftId },
  );
  const externalPost = await client.callTool({
    name: "post_get_delivery",
    arguments: { brandId, draftId },
  });
  assert.deepEqual(
    post.structuredContent,
    externalPost.structuredContent,
    "both assistants read the same delivery state",
  );
  const requestPost = {
    brandId,
    draftId,
    expectedDraftRevision: (post.structuredContent as any).revision,
    requestKey: "post-submit-" + suffix,
  };
  const postApproval = await videoAssistant.call(
    actor,
    "post_request_submission",
    requestPost,
  );
  const manifest = await videoAssistant.preview(actor, postApproval.approvalId);
  assert.equal(manifest.kind, "publication");
  assert.equal(manifest.post.account.id, account.id);
  assert.equal(postCreates, 0);
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: { caption: "修改后的文案" },
  });
  await assert.rejects(
    () => videoAssistant.confirm(actor, postApproval.approvalId),
    /post_revision_conflict/,
    "changed content cannot use prior human confirmation",
  );
  const updated = await videoAssistant.call(actor, "post_get_delivery", {
    brandId,
    draftId,
  });
  const freshApproval = await videoAssistant.call(
    actor,
    "post_request_submission",
    {
      ...requestPost,
      expectedDraftRevision: updated.revision,
      requestKey: "fresh-post-" + suffix,
    },
  );
  const postContext = {
    params: Promise.resolve({ id: freshApproval.approvalId }),
  };
  const submitPost = () =>
    confirmRoute(
      new Request(
        "https://amc.fixture.invalid/api/video-assistant/confirm/" +
          freshApproval.approvalId,
        { method: "POST", headers: browserHeaders, body: '{"confirmed":true}' },
      ),
      postContext,
    );
  const submitted = await Promise.all([submitPost(), submitPost()]);
  assert(submitted.every((r) => r.status === 200));
  const outputs = await Promise.all(submitted.map((r) => r.json()));
  assert(
    outputs.some((r) => r.state === "submitted"),
    JSON.stringify(outputs),
  );
  assert.equal(
    await prisma.postfastDeliveryJob.count({ where: { draftId } }),
    1,
  );
  assert.equal(postCreates, 0);
  const queue = await processPostfastDeliveryQueue({ maxRuntimeMs: 30000 });
  assert.equal(
    queue.succeeded,
    1,
    JSON.stringify({
      queue,
      jobs: await prisma.postfastDeliveryJob.findMany({
        where: { draftId },
        select: { status: true, lastErrorCode: true, lastErrorMessage: true },
      }),
    }),
  );
  assert.equal(postCreates, 1);
  const delivered = await videoAssistant.call(actor, "post_get_delivery", {
    brandId,
    draftId,
  });
  assert.equal(delivered.status, "scheduled");
  assert.equal(delivered.delivery.status, "SUCCEEDED");
  assert.equal(delivered.publishedAt, null);
  await videoAssistant.confirm(actor, freshApproval.approvalId);
  assert.equal(postCreates, 1, "confirmation replay cannot repost");
  const response = await outputRoute(
    new Request(
      "https://amc.fixture.invalid/api/video-assistant/output?" + query,
      { headers: { cookie: "session=" + session } },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal((await response.arrayBuffer()).byteLength, 8);
  assert.equal(
    (await videoAssistant.call(actor, "video_list_projects", { brandId })).items
      .length,
    1,
  );
  // Changes while queued and expired exact schedules never publish; ambiguous create never retries.
  const originalProjectId = project.id;
  async function queueAnother(label: string) {
    project.id = "basic_" + label + "_" + suffix;
    const ready = await videoAssistant.call(actor, "video_get_project", {
      brandId,
      projectId: project.id,
    });
    const prepared = await videoAssistant.call(actor, "video_prepare_post", {
      brandId,
      projectId: project.id,
      expectedRevision: ready.revision,
      requestKey: "prepare-" + label + "-" + suffix,
      accountId: account.id,
      caption: "本地隔离 " + label,
    });
    const approval = await videoAssistant.call(
      actor,
      "post_request_submission",
      {
        brandId,
        draftId: prepared.draftId,
        expectedDraftRevision: prepared.revision,
        requestKey: "approval-" + label + "-" + suffix,
      },
    );
    assert.equal(
      (await videoAssistant.confirm(actor, approval.approvalId)).state,
      "submitted",
    );
    return prepared.draftId;
  }
  const staleId = await queueAnother("stale");
  await prisma.contentDraft.update({
    where: { id: staleId },
    data: { caption: "确认后修改" },
  });
  assert.equal(
    (await processPostfastDeliveryQueue({ maxRuntimeMs: 30000 })).failed,
    1,
  );
  assert.equal(
    (await prisma.contentDraft.findUnique({ where: { id: staleId } }))
      ?.deliveryFailureCode,
    "POST_APPROVAL_STALE",
  );
  assert.equal(postCreates, 1);
  const expiredId = await queueAnother("expired");
  const expiredJob = await prisma.postfastDeliveryJob.findFirstOrThrow({
    where: { draftId: expiredId },
  });
  const expiredPayload = expiredJob.payload as any;
  expiredPayload.publish.scheduledAt = new Date(
    Date.now() - 1000,
  ).toISOString();
  await prisma.postfastDeliveryJob.update({
    where: { id: expiredJob.id },
    data: { payload: expiredPayload },
  });
  assert.equal(
    (await processPostfastDeliveryQueue({ maxRuntimeMs: 30000 })).failed,
    1,
  );
  assert.equal(
    (await prisma.contentDraft.findUnique({ where: { id: expiredId } }))
      ?.deliveryFailureCode,
    "POST_SCHEDULE_EXPIRED",
  );
  assert.equal(postCreates, 1);
  unknownPost = true;
  const uncertainId = await queueAnother("unknown");
  assert.equal(
    (await processPostfastDeliveryQueue({ maxRuntimeMs: 30000 })).resultUnknown,
    1,
  );
  const uncertain = await prisma.postfastDeliveryJob.findFirstOrThrow({
    where: { draftId: uncertainId },
  });
  assert.equal(uncertain.status, "RESULT_UNKNOWN");
  assert.equal(uncertain.nextAttemptAt, null);
  assert.equal(postCreates, 2);
  project.id = originalProjectId;
  console.log(
    "PASS queued content edits and expired exact schedules block provider calls; missing provider receipt remains RESULT_UNKNOWN without automatic retry",
  );
  // A non-admin with explicit current grants has the same capability, without role escalation.
  await prisma.roleDefinition.create({
    data: {
      id: roleId,
      name: roleId,
      normalizedName: roleId,
      policy: {
        create: {
          grants: [
            "content.video-making.read",
            "content.video-making.create",
            "content.video-making.generate",
            "content.video-making.update",
          ],
        },
      },
    },
  });
  await prisma.userBusinessRole.create({ data: { userId, role: roleId } });
  await prisma.brandOwner.create({ data: { brandId, userId } });
  await prisma.marketingCrew.create({
    data: {
      brandId,
      members: { create: { userId, role: "OWNER", active: true } },
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { role: "USER" } });
  const scoped = await videoAssistant.call(actor, "video_create_draft", {
    brandId,
    requestKey: "nonadmin-" + suffix,
    prompt: "Explicit authorized script",
    assetIds: [],
    language: "zh",
    platform: "tiktok",
    durationSec: 15,
    aspectRatio: "9:16",
  });
  assert.equal(scoped.ok, true);
  await prisma.rolePermissionPolicy.update({
    where: { role: roleId },
    data: {
      grants: ["content.video-making.read", "content.video-making.update"],
    },
  });
  const finalOnly = await videoAssistant.call(actor, "video_request_review", {
    brandId,
    projectId: project.id,
    expectedRevision: current.revision,
    requestKey: "review-only-" + suffix,
  });
  assert.equal(
    finalOnly.state,
    "awaiting_input",
    "review follows Content update permission, not generate",
  );
  await prisma.rolePermissionPolicy.update({
    where: { role: roleId },
    data: { grants: ["content.video-making.read"] },
  });
  await assert.rejects(
    () => videoAssistant.call(actor, "video_request_generation", request),
    /Permission denied/,
  );
  await prisma.user.update({
    where: { id: userId },
    data: { status: "SUSPENDED" },
  });
  const revoked = await client.callTool({
    name: "video_get_project",
    arguments: { brandId, projectId: project.id },
  });
  assert.equal(revoked.isError, true);
  console.log(
    "PASS video final review → bound post draft → native/external parity → stale approval rejected → real session confirmation → durable delivery queue → streamed fixture upload → provider scheduled (not published), no duplicate posts",
  );
  console.log(
    "PASS real PostgreSQL + actual native in-process MCP/external MCP parity, signed Content identity, concurrent durable approvals/replay, session-only same-origin confirmation, final-review-gated byte stream and revoked identity",
  );
} finally {
  global.fetch = realFetch;
  await client?.close();
  await server?.close();
  await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  await prisma.brand.deleteMany({ where: { id: brandId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.rolePermissionPolicy.deleteMany({ where: { role: roleId } });
  await prisma.roleDefinition.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
}
