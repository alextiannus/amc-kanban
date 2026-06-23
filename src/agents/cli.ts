import { marketingGraph } from "./graph/marketingGraph.ts";
import { prisma } from "../lib/prisma.ts";
import { Command } from "@langchain/langgraph";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Usage: node --experimental-strip-types cli.ts [bootstrap|run|approve|reject] [brandId/taskId]");
    process.exit(1);
  }

  if (command === "bootstrap") {
    console.log("Bootstrapping mock database entries...");

    // Create a mock brand
    const brand = await prisma.brand.upsert({
      where: { id: "test-brand-cli" },
      update: {},
      create: {
        id: "test-brand-cli",
        name: "Uncle Lim's Halal Cai Fan",
        description: "Halal certified Nanyang mixed rice stall serving curry chicken and sambal fish",
        address: "Block 101 Geylang Serai Market, Singapore 402101 (Halal)",
        timezone: "Asia/Singapore"
      }
    });
    console.log("Created/Verified Brand:", brand.name);

    // Create a mock media asset
    const asset = await prisma.mediaAsset.create({
      data: {
        brandId: brand.id,
        url: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800",
        mimeType: "image/jpeg",
        aiReady: true,
        aiCaption: "Curry Chicken dish特写"
      }
    });
    console.log("Created MediaAsset:", asset.url);

    // Create a compliant mock work unit (task)
    const compliantTask = await prisma.workUnit.create({
      data: {
        title: "Create promotional post about our new Halal curry chicken recipe",
        description: "Focus on rich spices and mouth-watering curry chicken picture",
        status: "todo",
        brandId: brand.id,
        tags: ["instagram", "halal", "singapore"]
      }
    });
    console.log("Created Compliant WorkUnit ID:", compliantTask.id);

    // Create a violating mock work unit (task) that triggers HIL
    const violatingTask = await prisma.workUnit.create({
      data: {
        title: "Create promotional post about our new pork belly recipes",
        description: "Must emphasize rich pork belly options",
        status: "todo",
        brandId: brand.id,
        tags: ["instagram", "halal"]
      }
    });
    console.log("Created Violating WorkUnit ID:", violatingTask.id);

    console.log("\nBootstrap successful! Now you can run:");
    console.log(`1) Compliant path (auto-publishes):`);
    console.log(`   node --experimental-strip-types src/agents/cli.ts run ${compliantTask.id}`);
    console.log(`2) Violating path (triggers HIL):`);
    console.log(`   node --experimental-strip-types src/agents/cli.ts run ${violatingTask.id}`);
    process.exit(0);
  }

  if (command === "run") {
    const taskId = args[1];
    if (!taskId) {
      console.error("Error: Please provide a taskId. Run 'cli.ts bootstrap' first.");
      process.exit(1);
    }

    const task = await prisma.workUnit.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      console.error(`Error: Task ${taskId} not found.`);
      process.exit(1);
    }

    const brandId = task.brandId || "test-brand-cli";
    const config = { configurable: { thread_id: brandId } };

    console.log(`Starting LangGraph workflow for Brand: ${brandId}, Task: ${taskId}...`);

    try {
      const output = (await marketingGraph.invoke({
        taskId,
        brandId
      }, config)) as any;

      if (output.__interrupt__ && output.__interrupt__.length > 0) {
        console.log("\n[LangGraph Suspend] Flow interrupted by HIL.");
        console.log("Check the Kanban card in database. Card status is now 'pending'.");
        console.log(`To approve: node --experimental-strip-types src/agents/cli.ts approve ${brandId}`);
        console.log(`To reject:  node --experimental-strip-types src/agents/cli.ts reject ${brandId}`);
        process.exit(0);
      }

      console.log("\nWorkflow finished successfully without HIL interruption.");
      console.log("Final state values:", JSON.stringify(output, null, 2));
      process.exit(0);
    } catch (e: any) {
      console.error("Workflow failed with error:", e);
      process.exit(1);
    }
  }

  if (command === "approve") {
    const brandId = args[1];
    if (!brandId) {
      console.error("Error: Please provide a brandId.");
      process.exit(1);
    }

    const config = { configurable: { thread_id: brandId } };
    const state = await marketingGraph.getState(config);

    if (!state || !state.next || state.next.length === 0) {
      console.log(`No pending HIL state found for thread ${brandId}.`);
      process.exit(1);
    }

    console.log("Found pending HIL state. Resuming with approval...");
    
    // Resume execution using Command
    console.log("Resuming graph execution...");
    const output = (await marketingGraph.invoke(
      new Command({ resume: { approved: true, comment: "Approved via CLI" } }),
      config
    )) as any;

    console.log("\nWorkflow resumed and finished successfully!");
    console.log("Resulting Published URL:", output.publishedUrl);
    process.exit(0);
  }

  if (command === "reject") {
    const brandId = args[1];
    if (!brandId) {
      console.error("Error: Please provide a brandId.");
      process.exit(1);
    }

    const config = { configurable: { thread_id: brandId } };
    const state = await marketingGraph.getState(config);

    if (!state || !state.next || state.next.length === 0) {
      console.log(`No pending HIL state found for thread ${brandId}.`);
      process.exit(1);
    }

    console.log("Found pending HIL state. Resuming with rewrite instruction...");
    
    const comment = "Please rewrite the post without referencing pork belly or pork. Must be Halal!";
    console.log(`Injecting critique comment: "${comment}"`);

    // Resume execution using Command
    console.log("Resuming graph execution...");
    const output = (await marketingGraph.invoke(
      new Command({ resume: { approved: false, comment } }),
      config
    )) as any;

    if (output.__interrupt__ && output.__interrupt__.length > 0) {
      console.log("\n[LangGraph Suspend] Flow interrupted by HIL again.");
      console.log("Check the Kanban card in database. Card status is now 'pending'.");
      console.log(`To approve: node --experimental-strip-types src/agents/cli.ts approve ${brandId}`);
      console.log(`To reject:  node --experimental-strip-types src/agents/cli.ts reject ${brandId}`);
      process.exit(0);
    }

    console.log("\nWorkflow resumed and finished successfully after rewrite!");
    console.log("Resulting Published URL:", output.publishedUrl);
    process.exit(0);
  }

  console.log(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
