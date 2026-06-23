import { marketingGraph } from "../src/agents/graph/marketingGraph.ts";
import { prisma } from "../src/lib/prisma.ts";
import { Command } from "@langchain/langgraph";

async function runTest() {
  console.log("================= Starting HIL E2E Test =================");

  // 1. Verify / Setup brand
  const brand = await prisma.brand.upsert({
    where: { id: "test-brand-cli" },
    update: {},
    create: {
      id: "test-brand-cli",
      name: "Uncle Lim's Halal Cai Fan",
      description: "Halal certified Nanyang mixed rice stall",
      address: "Block 101 Geylang Serai Market, Singapore (Halal)"
    }
  });
  console.log("1. Brand validated:", brand.name);

  // 2. Create a task that triggers Halal violation
  const task = await prisma.workUnit.create({
    data: {
      title: "Create promotional post about our new pork belly recipes",
      description: "Must emphasize rich pork belly options",
      status: "todo",
      brandId: brand.id,
      tags: ["instagram", "halal"]
    }
  });
  console.log("2. Created violating task ID:", task.id);

  const config = { configurable: { thread_id: brand.id } };

  // 3. Invoke graph and expect HIL Interrupt
  console.log("3. Invoking LangGraph workflow...");
  let hasInterrupted = false;
  try {
    const res = (await marketingGraph.invoke({
      taskId: task.id,
      brandId: brand.id
    }, config)) as any;
    
    if (res.__interrupt__ && res.__interrupt__.length > 0) {
      console.log("   -> Successfully caught LangGraph HIL Interrupt!");
      hasInterrupted = true;
    } else {
      console.log("   -> Graph completed without interrupt. Result:", JSON.stringify(res));
    }
  } catch (e: any) {
    console.error("   -> Unexpected graph failure:", e);
    process.exit(1);
  }

  if (!hasInterrupted) {
    console.error("   -> FAILED: Graph did not trigger an interrupt.");
    process.exit(1);
  }

  // 4. Verify Kanban card is set to pending in database
  console.log("4. Verifying database state...");
  const updatedTask = await prisma.workUnit.findUnique({
    where: { id: task.id }
  });

  if (updatedTask && updatedTask.status === "pending") {
    console.log("   -> Success: Kanban card status is 'pending' in database.");
  } else {
    console.error("   -> FAILED: Database task status is not pending. Status:", updatedTask?.status);
    process.exit(1);
  }

  // 5. Verify Checkpoint is stored and next node is complianceCheck
  const state = await marketingGraph.getState(config);
  console.log("5. Current Graph next node:", state.next);
  if (state.next && state.next.includes("complianceCheck")) {
    console.log("   -> Success: Next node is correct.");
  } else {
    console.error("   -> FAILED: Next node is incorrect.");
    process.exit(1);
  }

  // 6. Simulate Human Approval (Command resume)
  console.log("6. Simulating Human Brand Manager approval via Command...");
  
  // 7. Resume the graph execution using Command
  console.log("7. Resuming graph execution...");
  const output = await marketingGraph.invoke(
    new Command({ resume: { approved: true, comment: "It's mock pork, approved!" } }),
    config
  );

  console.log("8. Verifying final state values...");
  console.log("   -> Final status:", output.status);
  console.log("   -> Published URL:", output.publishedUrl);

  const finalTask = await prisma.workUnit.findUnique({
    where: { id: task.id }
  });

  if (finalTask && finalTask.status === "done") {
    console.log("   -> Success: Kanban card is closed as 'done' in database.");
  } else {
    console.error("   -> FAILED: Database task status is not done. Status:", finalTask?.status);
    process.exit(1);
  }

  // Cleanup
  await prisma.workUnit.delete({
    where: { id: task.id }
  });
  console.log("\n================= HIL E2E Test SUCCESS =================");
  process.exit(0);
}

runTest().catch(e => {
  console.error("Test failed with error:", e);
  process.exit(1);
});
