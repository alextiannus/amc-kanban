/** Read-only production smoke; pass the connected user's ID and an authorized brand. */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.ts";
import { actorFor } from "../src/lib/ai-native/contract.ts";
import {
  listBusinessTools,
  callBusinessTool,
} from "../src/lib/ai-native/business-tools.ts";
import { VIDEO_TOOLS } from "../src/lib/video-assistant/tools.ts";
const [userId, brandId] = process.argv.slice(2);
assert(userId && brandId);
try {
  const actor = actorFor(brandId, userId);
  const catalog = await listBusinessTools(actor, "video");
  assert.deepEqual(
    catalog.tools.map((t) => t.name).sort(),
    Object.keys(VIDEO_TOOLS).sort(),
  );
  const videos = await callBusinessTool(actor, "video_list_projects", {});
  assert(!videos.isError);
  const list = videos.structuredContent as any;
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { postfastSyncedAt: true },
  });
  const counts = await prisma.postfastDeliveryJob.groupBy({
    by: ["status"],
    where: { brandId },
    _count: true,
  });
  const accounts = await prisma.socialAccount.count({
    where: { brandId, unboundAt: null, connectionStatus: "CONNECTED" },
  });
  console.log(
    JSON.stringify(
      {
        check: "production-native-video-smoke",
        commit: process.env.RENDER_GIT_COMMIT,
        sharedTools: catalog.tools.map((t) => t.name),
        contentReadOk: true,
        ownedVideoFirstPageCount: list?.items?.length,
        cronConfigured: Boolean(process.env.CRON_SECRET),
        lastFullSocialSyncAt: brand.postfastSyncedAt,
        connectedAccountCount: accounts,
        deliveryCounts: counts,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
