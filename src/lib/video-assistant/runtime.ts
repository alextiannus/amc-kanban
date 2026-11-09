import { videoReceipts } from "./receipt-store";
import { createPostAssistant } from "./post-service";
import { prisma } from "../prisma";
import { requireActorPermission } from "../role-permissions/delegation";
import { signAccessIdentity } from "../role-permissions/token";
import { createVideoAssistant, type VideoActor } from "./core";

async function authorize(
  actor: VideoActor,
  brandId: string,
  permission: string,
) {
  const p = await requireActorPermission(actor.userId, permission, brandId);
  if (actor.authVersion !== undefined && actor.authVersion !== p.authVersion)
    throw Object.assign(Error("Identity revoked"), { status: 401 });
  return p;
}
const origin = (
  process.env.NEXT_PUBLIC_APP_URL || "https://amc-kanban.immedi.ai"
).replace(/\/$/, "");
const posts = createPostAssistant({
  authorize,
  origin,
  readVideo: async (actor, brandId, id) => {
    const r = await fetchVideoContent(
      actor,
      "GET",
      "/v1/lab/basic-video/drafts/" + encodeURIComponent(id),
      { brandId },
    );
    const data = await r.json().catch(() => null);
    if (
      !r.ok ||
      data?.id !== id ||
      data?.brandId !== brandId ||
      data?.createdBy !== actor.userId
    )
      throw Object.assign(Error("video_not_found"), { status: 404 });
    return data;
  },
});
export const videoAssistant = createVideoAssistant({
  ...videoReceipts,
  posts,
  now: () => Date.now(),
  origin,
  authorize: async (...args) => {
    await authorize(...args);
  },
  async content(actor, method, path, body) {
    const response = await fetchVideoContent(actor, method, path, body);
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw Object.assign(
        Error(data?.error || "视频服务暂不可用，请读取原任务。"),
        { status: response.status },
      );
    if (!data) throw Error("视频服务没有返回有效回执。");
    if (
      method === "GET" &&
      data.id &&
      data.brandId === body.brandId &&
      Array.isArray(data.referenceAssetIds)
    ) {
      const assets = await prisma.mediaAsset.findMany({
        where: { brandId: body.brandId, id: { in: data.referenceAssetIds } },
        select: { id: true, filename: true, url: true, mimeType: true },
      });
      data.selectedAssets = assets.map((a: any) => ({
        ...a,
        url:
          typeof a.url === "string" && /^https?:\/\//.test(a.url)
            ? a.url
            : null,
      }));
    }
    return data;
  },
});

/** Stream callers perform project/output checks through downloadTarget before this fixed transport. */
export async function fetchVideoContent(
  actor: VideoActor,
  method: string,
  path: string,
  body: any,
): Promise<Response> {
  if (
    !/^\/v1\/lab\/(basic-video\/drafts|video-projects\/)/.test(path) ||
    !body?.brandId
  )
    throw Error("Invalid video route");
  const permission =
    method === "GET" || path.split("?")[0].endsWith("/estimate")
      ? "read"
      : path.endsWith("/stop") || path.endsWith("/confirm")
        ? "update"
        : path === "/v1/lab/basic-video/drafts"
          ? "create"
          : "generate";
  const p = await authorize(
    actor,
    body.brandId,
    "content.video-making." + permission,
  );
  const base = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, ""),
    token = process.env.AMC_CONTENT_SERVICE_TOKEN;
  if (!base || !token || process.env.AMC_CONTENT_REMOTE_ENABLED === "false")
    throw Object.assign(Error("视频制作服务尚未配置。"), { status: 503 });
  return fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      "x-amc-access-identity": signAccessIdentity(p, body.brandId),
      "x-amc-actor-id": p.userId,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(115000),
  });
}
