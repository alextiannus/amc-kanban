import { prisma } from "../../lib/prisma.ts";

export async function coordinatorNode(state: any) {
  console.log("=== CoordinatorNode Running ===");
  const taskId = state.taskId;

  if (!taskId) {
    throw new Error("Missing taskId in state annotation.");
  }

  const task = await prisma.workUnit.findUnique({
    where: { id: taskId },
    include: { brand: true }
  });

  if (!task) {
    throw new Error(`Task with ID ${taskId} not found in database.`);
  }

  // Extract draft ID if present in state or task
  let existingDraftId = state.draftId || null;
  if (!existingDraftId) {
    const match = `${task.description || ""} ${task.materials || ""}`.match(/(?:草稿|Draft)\s*ID:\s*([a-z0-9]{25,})/i);
    if (match) {
      existingDraftId = match[1];
    }
  }

  let draftMediaUrls: string[] = [];
  let mediaFromDraft = false;

  if (existingDraftId) {
    try {
      const draft = await prisma.contentDraft.findUnique({
        where: { id: existingDraftId },
        include: {
          assetRefs: {
            include: { asset: true }
          }
        }
      });
      if (draft) {
        const urlAssets = draft.mediaUrls || [];
        const refAssets = (draft as any).assetRefs?.map((r: any) => r.asset?.url).filter(Boolean) || [];
        draftMediaUrls = Array.from(new Set([...urlAssets, ...refAssets]));
        if (draftMediaUrls.length > 0) {
          mediaFromDraft = true;
          console.log(`Coordinator: Found ${draftMediaUrls.length} existing media URLs in draft ${existingDraftId}. Preserving.`);
        }
      }
    } catch (err) {
      console.error("Failed to load draft details in coordinatorNode:", err);
    }
  }

  // Detect platform from tags, title, or description
  let platform: string | null = state.platform || null;
  if (!platform && task.tags && task.tags.length > 0) {
    const matched = task.tags.find(t => ["instagram", "facebook", "google_business", "red", "xiaohongshu", "tiktok"].includes(t.toLowerCase()));
    if (matched) {
      platform = matched.toLowerCase() === "xiaohongshu" ? "red" : matched.toLowerCase();
    }
  }

  if (!platform) {
    const searchSource = `${task.title} ${task.description || ""}`.toLowerCase();
    if (searchSource.includes("instagram")) {
      platform = "instagram";
    } else if (searchSource.includes("facebook")) {
      platform = "facebook";
    } else if (searchSource.includes("google_business") || searchSource.includes("google business") || searchSource.includes("google maps") || searchSource.includes("google")) {
      platform = "google_business";
    } else if (searchSource.includes("red") || searchSource.includes("xiaohongshu") || searchSource.includes("小红书")) {
      platform = "red";
    } else if (searchSource.includes("tiktok") || searchSource.includes("抖音")) {
      platform = "tiktok";
    }
  }

  if (!platform) {
    console.log(`Coordinator: Publishing platform is uncertain for task ${taskId}`);
    await prisma.workUnit.update({
      where: { id: taskId },
      data: {
        status: "pending",
        requiredInput: "Publishing channel is uncertain. Please specify a platform tag (e.g., 'instagram', 'red'/'xiaohongshu', 'facebook', 'tiktok', 'google_business') or mention it in the task details to resume."
      }
    });
    return {
      brandId: task.brandId || "",
      status: "pending",
      error: "Uncertain publishing channel"
    };
  }

  console.log(`Coordinator selected platform: ${platform} for Brand: ${task.brand?.name || "Unknown"}`);

  return {
    brandId: task.brandId || "",
    platform,
    draftId: existingDraftId || "",
    mediaUrls: draftMediaUrls,
    mediaFromDraft,
    status: "in_progress"
  };
}
