import { marketingGraph } from "../src/agents/graph/marketingGraph.ts";
import { prisma } from "../src/lib/prisma.ts";

async function runTest() {
  console.log("================= Starting Copywriting Preservation Test =================");

  // 1. Setup mock brand
  const brand = await prisma.brand.upsert({
    where: { id: "test-brand-preservation" },
    update: {
      name: "SG Fitness Club",
      description: "A premium boutique fitness gym in downtown Singapore."
    },
    create: {
      id: "test-brand-preservation",
      name: "SG Fitness Club",
      description: "A premium boutique fitness gym in downtown Singapore."
    }
  });
  console.log("1. Mock brand configured.");

  // 2. Setup mock social account
  const account = await prisma.socialAccount.upsert({
    where: {
      brandId_platformId_handle: {
        brandId: brand.id,
        platformId: "instagram",
        handle: "sg_fitness_club"
      }
    },
    update: {},
    create: {
      brandId: brand.id,
      platformId: "instagram",
      handle: "sg_fitness_club",
      displayName: "SG Fitness Instagram",
      autoPilot: true
    }
  });

  // 3. Create mock ContentDraft WITHOUT any mediaUrls first
  const customPrompt = "Write an engaging post about our new pilates reformer class. Call to action: Sign up now!";
  
  const draft = await prisma.contentDraft.create({
    data: {
      brandId: brand.id,
      accountId: account.id,
      caption: customPrompt,
      mediaUrls: [], // Empty initially to test warning flow
      hashtags: ["original"],
      status: "draft"
    }
  });
  console.log("2. Mock ContentDraft (empty media) created with ID:", draft.id);

  // 4. Create task containing Draft ID
  const task = await prisma.workUnit.create({
    data: {
      title: "Copywriting task for Reformer Pilates Class",
      description: `Draft ID: ${draft.id}\nPrompt: ${customPrompt}`,
      status: "todo",
      brandId: brand.id,
      tags: ["instagram"]
    }
  });
  console.log("3. Created Kanban task with ID:", task.id);

  // 5. Invoke graph with copywriteOnly: true (Expect suspend because mediaUrls is empty)
  console.log("4. Running graph in copywriteOnly mode with EMPTY media (expecting warning)...");
  const config = { configurable: { thread_id: `${brand.id}-${Date.now()}` } };
  
  const res1 = await marketingGraph.invoke({
    taskId: task.id,
    brandId: brand.id,
    draftId: draft.id,
    platform: "instagram",
    copywriteOnly: true
  }, config) as any;

  console.log("5. Phase 1 invocation completed. Status:", res1.status, "Error:", res1.error);

  // Verify DB state for Phase 1
  const draftPhase1 = await prisma.contentDraft.findUnique({ where: { id: draft.id } });
  const taskPhase1 = await prisma.workUnit.findUnique({ where: { id: task.id } });

  let success = true;

  if (res1.status !== "pending" || res1.error !== "Missing attached assets") {
    console.error("FAILED: Graph did not suspend or returned incorrect status/error for empty media.");
    success = false;
  }
  if (draftPhase1?.caption !== "【AI 提示：请先选择或上传配图/视频再进行 AI 创作】") {
    console.error("FAILED: Draft caption was not set to the warning text. Got:", draftPhase1?.caption);
    success = false;
  }
  if (taskPhase1?.status !== "pending" || !taskPhase1.requiredInput?.includes("未检测到配图或视频")) {
    console.error("FAILED: Task status was not updated to pending or requiredInput was incorrect.");
    success = false;
  }

  if (success) {
    console.log("-> Phase 1 (Empty Media Check) PASSED!");
  } else {
    // Cleanup and exit early if phase 1 failed
    await prisma.workUnit.delete({ where: { id: task.id } });
    await prisma.contentDraft.delete({ where: { id: draft.id } });
    process.exit(1);
  }

  // 6. Reset task status and update draft with mediaUrls
  console.log("6. Simulating user adding a photo and triggering AI writing again...");
  const preExistingMedia = ["https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=800"];
  
  await prisma.contentDraft.update({
    where: { id: draft.id },
    data: {
      caption: customPrompt, // reset to original prompt
      mediaUrls: preExistingMedia
    }
  });

  await prisma.workUnit.update({
    where: { id: task.id },
    data: {
      status: "todo"
    }
  });

  // 7. Invoke graph again with copywriteOnly: true (Expect success because mediaUrls has elements)
  console.log("7. Running graph in copywriteOnly mode with media present...");
  const res2 = await marketingGraph.invoke({
    taskId: task.id,
    brandId: brand.id,
    draftId: draft.id,
    platform: "instagram",
    copywriteOnly: true
  }, config) as any;

  console.log("8. Phase 2 invocation completed. Status:", res2.status);

  // Fetch updated draft and task from database
  const updatedDraft = await prisma.contentDraft.findUnique({
    where: { id: draft.id }
  });
  const updatedTask = await prisma.workUnit.findUnique({
    where: { id: task.id }
  });

  if (!updatedDraft || !updatedTask) {
    console.error("FAILED: Draft or Task not found in DB after phase 2.");
    process.exit(1);
  }

  console.log("=== Verification Assertions ===");
  console.log("Updated Caption:", updatedDraft.caption);
  console.log("Updated Hashtags:", updatedDraft.hashtags);
  console.log("Updated MediaUrls:", updatedDraft.mediaUrls);
  console.log("Draft Status:", updatedDraft.status);
  console.log("Task Status:", updatedTask.status);

  // Caption should be generated and not empty/placeholder
  if (!updatedDraft.caption || updatedDraft.caption === customPrompt || updatedDraft.caption.includes("AI 提示")) {
    console.error("FAILED: Caption was not generated successfully.");
    success = false;
  }

  // MediaUrls must remain EXACTLY identical
  if (JSON.stringify(updatedDraft.mediaUrls) !== JSON.stringify(preExistingMedia)) {
    console.error(`FAILED: Media URLs were modified. Expected: ${preExistingMedia}, Got: ${updatedDraft.mediaUrls}`);
    success = false;
  }

  // Status must remain 'draft'
  if (updatedDraft.status !== "draft") {
    console.error(`FAILED: Draft status was modified. Expected: 'draft', Got: '${updatedDraft.status}'`);
    success = false;
  }

  // Task status must be 'done'
  if (updatedTask.status !== "done") {
    console.error(`FAILED: Task status was not updated to 'done'. Got: '${updatedTask.status}'`);
    success = false;
  }

  // Clean up database
  await prisma.workUnit.delete({ where: { id: task.id } });
  await prisma.contentDraft.delete({ where: { id: draft.id } });
  
  if (success) {
    console.log("================= SUCCESS: E2E COPYWRITING PRESERVATION TEST PASSED =================");
    process.exit(0);
  } else {
    console.error("================= FAILED: E2E COPYWRITING PRESERVATION TEST FAILED =================");
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error("E2E Test Exception:", err);
  process.exit(1);
});
