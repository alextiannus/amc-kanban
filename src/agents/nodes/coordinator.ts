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

  // Detect platform from tags or description, fallback to instagram
  let platform = "instagram";
  if (task.tags && task.tags.length > 0) {
    const matched = task.tags.find(t => ["instagram", "facebook", "google_business", "red", "tiktok"].includes(t.toLowerCase()));
    if (matched) platform = matched.toLowerCase();
  }

  console.log(`Coordinator selected platform: ${platform} for Brand: ${task.brand?.name || "Unknown"}`);

  return {
    brandId: task.brandId || "",
    platform,
    status: "in_progress"
  };
}
