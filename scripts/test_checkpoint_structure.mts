import { StateGraph, START, END, MemorySaver, Annotation } from "@langchain/langgraph";

const TestAnnotation = Annotation.Root({
  count: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0
  })
});

const memory = new MemorySaver() as any;

const originalPut = memory.put.bind(memory);
memory.put = async function (config: any, checkpoint: any, metadata: any, newVersions: any) {
  console.log("put called with:");
  console.log("  config:", JSON.stringify(config));
  console.log("  checkpoint keys:", Object.keys(checkpoint));
  console.log("  checkpoint.id:", checkpoint.id);
  console.log("  metadata:", JSON.stringify(metadata));
  console.log("  newVersions:", JSON.stringify(newVersions));
  return originalPut(config, checkpoint, metadata, newVersions);
};

const originalPutWrites = memory.putWrites.bind(memory);
memory.putWrites = async function (config: any, writes: any, taskId: any) {
  console.log("putWrites called with:");
  console.log("  config:", JSON.stringify(config));
  console.log("  writes:", JSON.stringify(writes));
  console.log("  taskId:", taskId);
  return originalPutWrites(config, writes, taskId);
};

const originalGetTuple = memory.getTuple.bind(memory);
memory.getTuple = async function (config: any) {
  console.log("getTuple called with:", JSON.stringify(config));
  const res = await originalGetTuple(config);
  if (res) {
    console.log("getTuple returned keys:", Object.keys(res));
    console.log("  checkpoint keys:", Object.keys(res.checkpoint));
    console.log("  metadata keys:", Object.keys((res.metadata || {}) as object));
  } else {
    console.log("getTuple returned undefined");
  }
  return res;
};

const graph = new StateGraph(TestAnnotation)
  .addNode("step1", (state) => ({ count: 1 }))
  .addEdge(START, "step1")
  .addEdge("step1", END);

const app = graph.compile({ checkpointer: memory });

const config = { configurable: { thread_id: "test-thread" } };
await app.invoke({ count: 5 }, config);
