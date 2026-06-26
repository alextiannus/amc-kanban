import { prisma } from "../../lib/prisma.ts";
import { generateText } from "../../lib/gemini.ts";
import { interrupt } from "@langchain/langgraph";

function getPlatformLimits(platform: string) {
  const p = (platform || "").toLowerCase();
  if (p === "instagram" || p === "xiaohongshu" || p === "red" || p === "tiktok") {
    // Target 3-9 images, minimum required is 3 (or 1 video)
    return { target: 9, min: 3 };
  }
  if (p === "google_business" || p === "google") {
    // Target 1-2 images, minimum required is 1
    return { target: 2, min: 1 };
  }
  return { target: 1, min: 1 };
}

export async function assetCuratorNode(state: any) {
  console.log("=== AssetCuratorNode Running ===");
  const { brandId, taskId, platform, mediaUrls, mediaFromDraft, copywriteOnly } = state;

  if (mediaUrls && mediaUrls.length > 0) {
    console.log(`AssetCurator: Preserving existing ${mediaUrls.length} media URLs. Skipping curation.`);
    return { mediaUrls };
  }

  if (mediaFromDraft || copywriteOnly) {
    console.log(`AssetCurator: mediaFromDraft or copywriteOnly is true. Skipping curation.`);
    return { mediaUrls: mediaUrls || [] };
  }

  if (!brandId) {
    throw new Error("Missing brandId in state.");
  }

  const { target, min } = getPlatformLimits(platform);

  // 1. Fetch the active task
  let task = null;
  if (taskId) {
    try {
      task = await prisma.workUnit.findUnique({
        where: { id: taskId }
      });
    } catch (err) {
      console.error("Failed to fetch task in assetCuratorNode:", err);
    }
  }

  // 2. Query ready media assets from the database
  const assets = await prisma.mediaAsset.findMany({
    where: {
      brandId,
      aiReady: true
    },
    orderBy: { createdAt: "desc" }
  });

  if (assets.length === 0) {
    console.log(`AssetCurator: Brand has no assets at all in the library. Curation failed.`);
    if (taskId) {
      await prisma.workUnit.update({
        where: { id: taskId },
        data: {
          status: "pending",
          requiredInput: "Incomplete materials: No assets found in the brand library. Please upload images or videos to the Asset Library (素材库) first."
        }
      });
    }
    return {
      status: "pending",
      error: "Missing brand assets"
    };
  }

  let selectedUrls: string[] = [];
  let geminiUsed = false;

  // 3. Select matching assets via Gemini if assets exist and task is valid
  if (task && assets.length > 0) {
    console.log(`AssetCurator: Matching candidate assets against task "${task.title}" for platform "${platform}" (Target: ${target}, Min: ${min}).`);
    
    const prompt = `You are an AI Asset Curator. Select the top matching visual assets for a social media post.
Active Task Title: "${task.title}"
Active Task Description: ${task.description || "No description provided."}
Target Social Platform: ${platform}
Target Number of Assets: ${target}

Available candidate assets in the brand's library:
${assets.map((asset: any, index: number) => `[Asset ${index + 1}]
URL: ${asset.url}
Filename: ${asset.filename || "N/A"}
AI Tags: ${asset.aiTags.join(", ") || "N/A"}
AI Category: ${asset.aiCategory || "N/A"}
AI Caption: ${asset.aiCaption || "N/A"}
`).join("\n")}

Goal: Select up to ${target} of the most relevant asset URLs that fit the task topic.
Return ONLY a valid JSON array of strings (the selected URL strings), for example:
["url1", "url2"]
Do NOT write any other explanation or markdown code fences.`;

    try {
      const responseText = await generateText(prompt, 500);
      if (responseText) {
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const urls = JSON.parse(cleanJson);
        if (Array.isArray(urls)) {
          // Filter to ensure all returned URLs are actual candidates
          selectedUrls = urls.filter((u: any) => assets.some((a: any) => a.url === u));
          geminiUsed = true;
          console.log(`Gemini selected ${selectedUrls.length} relevant assets.`);
        }
      }
    } catch (err) {
      console.error("Gemini asset curator selection failed:", err);
    }
  }

  // Fallback: If Gemini wasn't used or returned nothing, select top assets by date
  if (selectedUrls.length === 0 && assets.length > 0) {
    selectedUrls = assets.slice(0, target).map((a: any) => a.url);
  }

  // 4. Insufficient Assets Check
  if (selectedUrls.length < min) {
    console.log(`Insufficient assets: found ${selectedUrls.length}, but minimum target is ${min} for platform ${platform}.`);

    // Update WorkUnit to require input (pending status)
    if (taskId) {
      await prisma.workUnit.update({
        where: { id: taskId },
        data: {
          status: "pending",
          requiredInput: `HIL Asset Supplement Required. Reason: Only matched ${selectedUrls.length} images, but platform ${platform} requires at least ${min}. Please upload more assets or approve compiling existing assets into a video.`
        }
      });
    }

    // Trigger LangGraph interrupt and await human feedback
    console.log("HIL Triggered in AssetCurator: Awaiting Human approval or asset upload.");
    const humanFeedback: any = interrupt({
      errorType: "INSUFFICIENT_ASSETS",
      platform,
      minRequired: min,
      currentCount: selectedUrls.length,
      availableUrls: selectedUrls
    });

    console.log("AssetCurator HIL Resumed! Human feedback received:", JSON.stringify(humanFeedback));

    if (humanFeedback && humanFeedback.action === "compile_video") {
      console.log("Human approved compiling matching assets into a slideshow video.");
      // Compile existing images into a video (simulated video file)
      const videoUrl = `/uploads/videos/compiled_${taskId || Date.now()}.mp4`;
      return {
        mediaUrls: [videoUrl]
      };
    } else if (humanFeedback && humanFeedback.action === "retry") {
      console.log("Human uploaded more assets and requested retry. Re-querying database...");
      // Re-query ready assets
      const freshAssets = await prisma.mediaAsset.findMany({
        where: {
          brandId,
          aiReady: true
        },
        orderBy: { createdAt: "desc" }
      });
      let freshUrls = freshAssets.slice(0, target).map(a => a.url);

      if (freshUrls.length < min) {
        console.warn("Assets still insufficient after retry. Automatically compiling slideshow video to prevent deadlock.");
        const videoUrl = `/uploads/videos/compiled_${taskId || Date.now()}.mp4`;
        return {
          mediaUrls: [videoUrl]
        };
      }

      return {
        mediaUrls: freshUrls
      };
    } else {
      throw new Error("Workflow aborted: Rejected by Human Operator during asset curation.");
    }
  }

  // 5. Success return
  if (selectedUrls.length === 0) {
    // Ultimate fallback if database is completely empty
    selectedUrls.push("https://images.unsplash.com/photo-1544025162-d76694265947?w=800");
  }

  return {
    mediaUrls: selectedUrls
  };
}
