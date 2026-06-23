import { prisma } from "../../lib/prisma.ts";

export async function assetCuratorNode(state: any) {
  console.log("=== AssetCuratorNode Running ===");
  const { brandId, taskId } = state;

  if (!brandId) {
    throw new Error("Missing brandId in state.");
  }

  // Query assets from database
  const assets = await prisma.mediaAsset.findMany({
    where: {
      brandId,
      aiReady: true
    },
    orderBy: { createdAt: "desc" }
  });

  const selectedMediaUrls: string[] = [];

  if (assets && assets.length > 0) {
    console.log(`AssetCurator found ${assets.length} assets. Selecting the most recent one.`);
    selectedMediaUrls.push(assets[0].url);
  } else {
    console.log(`AssetCurator found 0 ready assets in database for Brand ${brandId}. Falling back to default brand asset or stock image.`);
    // Fallback stock image to prevent crash
    selectedMediaUrls.push("https://images.unsplash.com/photo-1544025162-d76694265947?w=800");
  }

  return {
    mediaUrls: selectedMediaUrls
  };
}
