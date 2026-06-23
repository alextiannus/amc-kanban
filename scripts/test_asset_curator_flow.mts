import { marketingGraph } from "../src/agents/graph/marketingGraph.ts";
import { prisma } from "../src/lib/prisma.ts";
import { Command } from "@langchain/langgraph";

async function runTest() {
  console.log("================= Starting Asset Curator E2E Test =================");

  const brandId = "test-brand-curator";
  const threadId = "thread-curator-test";

  // 1. Setup brand
  const brand = await prisma.brand.upsert({
    where: { id: brandId },
    update: {},
    create: {
      id: brandId,
      name: "Uncle Lim's Cai Fan",
      description: "Nanyang mixed rice stall",
      address: "Block 101 Geylang Serai Market, Singapore"
    }
  });
  console.log("1. Brand setup complete:", brand.name);

  // Clean up any old assets and tasks for this test brand
  await prisma.mediaAsset.deleteMany({ where: { brandId } });
  await prisma.workUnit.deleteMany({ where: { brandId } });

  // 2. Add only ONE asset to the DB (which is insufficient for Instagram, which requires min 3)
  const singleAsset = await prisma.mediaAsset.create({
    data: {
      brandId,
      url: "https://images.unsplash.com/photo-1544025162-d76694265947?w=800",
      mimeType: "image/jpeg",
      aiReady: true,
      filename: "rice_dish.jpg"
    }
  });
  console.log("2. Created single asset in library.");

  // 3. Create a task for Instagram
  const task = await prisma.workUnit.create({
    data: {
      title: "Promote new curry chicken recipe on Instagram",
      description: "Highlight spicy curry and traditional cooking",
      status: "todo",
      brandId,
      tags: ["instagram"]
    }
  });
  console.log("3. Created task for Instagram:", task.id);

  const config = { configurable: { thread_id: threadId } };

  // 4. Invoke graph and expect HIL Insufficient Assets Interrupt
  console.log("4. Invoking graph. Expecting INSUFFICIENT_ASSETS interrupt...");
  let hasInterrupted = false;
  try {
    const res = (await marketingGraph.invoke({
      taskId: task.id,
      brandId,
      platform: "instagram"
    }, config)) as any;

    if (res.__interrupt__ && res.__interrupt__.length > 0) {
      const details = res.__interrupt__[0].value;
      console.log(`   -> Successfully caught interrupt! Type: ${details.errorType}, Current Count: ${details.currentCount}, Required: ${details.minRequired}`);
      if (details.errorType === "INSUFFICIENT_ASSETS") {
        hasInterrupted = true;
      }
    } else {
      console.log("   -> Graph completed unexpectedly without interrupt:", JSON.stringify(res));
    }
  } catch (err) {
    console.error("   -> Unexpected graph failure:", err);
    process.exit(1);
  }

  if (!hasInterrupted) {
    console.error("   -> FAILED: Graph did not trigger INSUFFICIENT_ASSETS interrupt.");
    process.exit(1);
  }

  // 5. Verify task is set to pending in database
  const pendingTask = await prisma.workUnit.findUnique({ where: { id: task.id } });
  if (pendingTask && pendingTask.status === "pending") {
    console.log("5. Verified task status is 'pending' in database.");
  } else {
    console.error("   -> FAILED: Database task status is not pending. Status:", pendingTask?.status);
    process.exit(1);
  }

  // 6. Resume by choosing to compile video
  console.log("6. Resuming graph by selecting 'compile_video' action...");
  const videoOutput = await marketingGraph.invoke(
    new Command({ resume: { action: "compile_video" } }),
    config
  );

  console.log("7. Verifying compiled video output state...");
  console.log("   -> Media URL returned:", videoOutput.mediaUrls);
  console.log("   -> Graph Final Status:", videoOutput.status);

  if (videoOutput.mediaUrls && videoOutput.mediaUrls[0].includes("compiled_")) {
    console.log("   -> Success: Returned the compiled slideshow video URL!");
  } else {
    console.error("   -> FAILED: Compiled video URL not returned.");
    process.exit(1);
  }

  const finalTask = await prisma.workUnit.findUnique({ where: { id: task.id } });
  if (finalTask && finalTask.status === "done") {
    console.log("   -> Success: Kanban card is closed as 'done' in database.");
  } else {
    console.error("   -> FAILED: Database task status is not done. Status:", finalTask?.status);
    process.exit(1);
  }

  // Cleanup test run
  await prisma.mediaAsset.deleteMany({ where: { brandId } });
  await prisma.workUnit.deleteMany({ where: { brandId } });

  console.log("\n================= Asset Curator E2E Test SUCCESS =================");
  process.exit(0);
}

runTest().catch(e => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
