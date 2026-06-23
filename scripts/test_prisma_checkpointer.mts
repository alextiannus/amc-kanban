import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { PrismaCheckpointer } from "../src/agents/checkpointer.ts";
import { prisma } from "../src/lib/prisma.ts";

const TestAnnotation = Annotation.Root({
  count: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0
  })
});

// 1. Define a simple test graph
const graph = new StateGraph(TestAnnotation)
  .addNode("step1", (state) => {
    console.log("  Node 'step1' executing, current count:", state.count);
    return { count: 1 };
  })
  .addEdge(START, "step1")
  .addEdge("step1", END);

// 2. Initialize PrismaCheckpointer
const checkpointer = new PrismaCheckpointer();
const app = graph.compile({ checkpointer });

const threadId = "test-prisma-thread-" + Date.now();
const config = { configurable: { thread_id: threadId } };

console.log("Invoking graph for thread:", threadId);
await app.invoke({ count: 10 }, config);

// 3. Verify in database
console.log("Querying checkpoints in DB...");
const countInDb = await prisma.brandAgentCheckpoint.count({
  where: { threadId }
});
console.log("Total checkpoint rows in DB for this thread:", countInDb);

const latestRecord = await prisma.brandAgentCheckpoint.findFirst({
  where: { threadId },
  orderBy: { createdAt: "desc" }
});

if (latestRecord) {
  console.log("Successfully retrieved checkpoint from DB.");
  console.log("  checkpointId:", latestRecord.checkpointId);
  console.log("  checkpoint keys:", Object.keys(latestRecord.checkpoint as object));
} else {
  console.error("FAILED to retrieve checkpoint from DB.");
  process.exit(1);
}

// Clean up
await prisma.brandAgentCheckpoint.deleteMany({
  where: { threadId }
});
console.log("Cleaned up test data. Test completed successfully!");
process.exit(0);
