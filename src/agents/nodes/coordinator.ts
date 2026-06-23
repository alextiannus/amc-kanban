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

  // Detect platform from tags, title, or description
  let platform: string | null = null;
  if (task.tags && task.tags.length > 0) {
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
    status: "in_progress"
  };
}
