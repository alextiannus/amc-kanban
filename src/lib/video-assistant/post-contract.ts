import { createHash } from "node:crypto";
/** Stable JSON prevents the native and external wire field order changing identity. */
export function mediaDigest(v: unknown): string {
  const stable = (x: any): string =>
    x instanceof Date
      ? JSON.stringify(x.toISOString())
      : Array.isArray(x)
        ? "[" + x.map(stable).join(",") + "]"
        : x && typeof x === "object"
          ? "{" +
            Object.keys(x)
              .filter((k) => x[k] !== undefined)
              .sort()
              .map((k) => JSON.stringify(k) + ":" + stable(x[k]))
              .join(",") +
            "}"
          : (JSON.stringify(x) ?? "null");
  return createHash("sha256").update(stable(v)).digest("hex");
}
export function postRevisionFields(d: any) {
  return {
    id: d.id,
    brandId: d.brandId,
    updatedAt: d.updatedAt,
    caption: d.caption,
    captionLang: d.captionLang,
    hashtags: d.hashtags,
    accountId: d.accountId,
    account: d.account && {
      id: d.account.id,
      platformId: d.account.platformId,
      handle: d.account.handle,
      postfastAccountId: d.account.postfastAccountId,
      unboundAt: d.account.unboundAt,
      connectionStatus: d.account.connectionStatus,
    },
    gbpLocationId: d.gbpLocationId,
    instagramPublishType: d.instagramPublishType,
    postfastControls: d.postfastControls,
    coverAssetId: d.coverAssetId,
    mediaUrls: d.mediaUrls,
    provenance: d.viralCopyScriptProvenance,
    assets: (d.assetRefs || []).map((r: any) => ({
      assetId: r.assetId,
      order: r.order,
      url: r.asset?.url,
      contentHash: r.asset?.contentHash,
      mimeType: r.asset?.mimeType,
      technicalMetadata: r.asset?.technicalMetadata,
    })),
    cover: d.coverAsset && {
      url: d.coverAsset.url,
      contentHash: d.coverAsset.contentHash,
      mimeType: d.coverAsset.mimeType,
      technicalMetadata: d.coverAsset.technicalMetadata,
    },
    status: d.status,
    scheduledAt: d.scheduledAt,
    platformPostId: d.platformPostId,
    deliveryFailureCode: d.deliveryFailureCode,
  };
}
export const postInclude = {
  account: true,
  assetRefs: { orderBy: { order: "asc" as const }, include: { asset: true } },
  coverAsset: true,
} as const;

export const postRevision = (d: any) => mediaDigest(postRevisionFields(d));
export function postContentRevision(d: any) {
  const {
    updatedAt,
    status,
    scheduledAt,
    platformPostId,
    deliveryFailureCode,
    ...content
  } = postRevisionFields(d);
  return mediaDigest(content);
}
