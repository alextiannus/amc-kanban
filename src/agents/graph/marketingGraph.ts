import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.ts";
import { PrismaCheckpointer } from "../checkpointer.ts";
import { coordinatorNode } from "../nodes/coordinator.ts";
import { copywriterNode } from "../nodes/copywriter.ts";
import { assetCuratorNode } from "../nodes/assetCurator.ts";
import { designerNode } from "../nodes/designer.ts";
import { complianceNode } from "../nodes/compliance.ts";
import { publisherNode } from "../nodes/publisher.ts";
import { prisma } from "../../lib/prisma.ts";

// 1. Define the compliance evaluation node with HIL Interrupt support
async function complianceCheckNode(state: typeof StateAnnotation.State) {
  // If it was already approved by human (but redirected for redesign), bypass compliance check
  if (state.complianceReason && state.complianceReason.startsWith("Approved by Human")) {
    console.log("Compliance check bypassed: Human approved in previous step.");
    return {
      compliancePassed: true,
      approved: true
    };
  }

  const result = await complianceNode(state);

  // If compliance check fails, trigger LangGraph HIL Interrupt
  if (!result.compliancePassed) {
    console.log("HIL Triggered: Awaiting Human approval or correction.");
    
    // Create require_input WorkUnit card in database
    await prisma.workUnit.update({
      where: { id: state.taskId },
      data: {
        status: "pending",
        requiredInput: `HIL Approval Required. Reason: ${result.complianceReason}. Please approve or edit copy in comments.`
      }
    });

    // Suspend execution and wait for human response
    const humanFeedback: any = interrupt({
      errorType: "COMPLIANCE_FAILED",
      reason: result.complianceReason,
      caption: state.caption
    });

    console.log("HIL Resumed! Human feedback received:", JSON.stringify(humanFeedback));

    if (humanFeedback && humanFeedback.approved) {
      console.log("Human Brand Manager approved. Overriding compliance failure.");
      
      const resultUpdates: any = {
        compliancePassed: true,
        approved: true,
        complianceReason: "Approved by Human BM: " + (humanFeedback.comment || "")
      };

      if (humanFeedback.watermarkText) {
        console.log("Human provided watermarkText update. Redirecting to designer node.");
        resultUpdates.watermarkText = humanFeedback.watermarkText;
        resultUpdates.compliancePassed = false;
        resultUpdates.approved = false;
        resultUpdates.complianceReason = "Approved by Human: REDESIGN_REQUIRED: " + (humanFeedback.comment || "");
      }

      return resultUpdates;
    } else {
      console.log("Compliance override rejected or new text provided.");
      if (humanFeedback && humanFeedback.newCaption) {
        console.log("Direct caption correction provided by Human. Proceeding to publish.");
        return {
          caption: humanFeedback.newCaption,
          compliancePassed: true,
          approved: true,
          complianceReason: "Edited and approved by Human"
        };
      }
      if (humanFeedback && humanFeedback.comment) {
        console.log("Rejection with critique comment. Looping back to Copywriter.");
        return {
          compliancePassed: false,
          approved: false,
          complianceReason: "Rejected by human: " + humanFeedback.comment
        };
      }
      throw new Error("Workflow aborted: Rejected by Human Operator.");
    }
  }

  return result;
}

// 2. Build the workflow topology DAG
const workflow = new StateGraph(StateAnnotation)
  .addNode("coordinator", coordinatorNode)
  .addNode("copywriter", copywriterNode)
  .addNode("assetCurator", assetCuratorNode)
  .addNode("designer", designerNode)
  .addNode("complianceCheck", complianceCheckNode)
  .addNode("publisher", publisherNode)

  // Define edges
  .addEdge(START, "coordinator")
  .addEdge("coordinator", "copywriter")
  .addEdge("copywriter", "assetCurator")
  .addEdge("assetCurator", "designer")
  .addEdge("designer", "complianceCheck")
  
  // Conditional router after compliance check
  .addConditionalEdges(
    "complianceCheck",
    (state) => {
      if (state.compliancePassed || state.approved) {
        return "publish";
      }
      if (state.complianceReason && state.complianceReason.includes("REDESIGN_REQUIRED")) {
        return "redesign";
      }
      return "retry";
    },
    {
      publish: "publisher",
      redesign: "designer",
      retry: "copywriter"
    }
  )
  
  .addEdge("publisher", END);

// 3. Compile the graph with Prisma checkpointer for persistence
const checkpointer = new PrismaCheckpointer();

export const marketingGraph = workflow.compile({
  checkpointer
});
