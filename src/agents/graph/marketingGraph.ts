import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.ts";
import { PrismaCheckpointer } from "../checkpointer.ts";
import { coordinatorNode } from "../nodes/coordinator.ts";
import { researcherNode } from "../nodes/researcher.ts";
import { strategistNode } from "../nodes/strategist.ts";
import { copywriterNode } from "../nodes/copywriter.ts";
import { assetCuratorNode } from "../nodes/assetCurator.ts";
import { designerNode } from "../nodes/designer.ts";
import { complianceNode } from "../nodes/compliance.ts";
import { publisherNode } from "../nodes/publisher.ts";
import { prisma } from "../../lib/prisma.ts";

// 1. Define the compliance evaluation node with HIL Interrupt support
async function complianceCheckNode(state: typeof StateAnnotation.State) {
  // Short-circuit: if AI copywriting already failed, skip compliance and route to publisher to handle cleanup
  if (state.aiFailed) {
    console.log("Compliance check bypassed: aiFailed=true, routing to publisher for cleanup.");
    return { compliancePassed: true };
  }

  // If it was already approved by human (but redirected for redesign), bypass compliance check
  if (state.complianceReason && state.complianceReason.startsWith("Approved by Human")) {
    console.log("Compliance check bypassed: Human approved in previous step.");
    return {
      compliancePassed: true,
      approved: true
    };
  }

  const result = await complianceNode(state);

  // If compliance check fails, check retry count
  if (!result.compliancePassed) {
    if (state.copywriteOnly) {
      console.log(`Compliance failed during copywriteOnly mode: ${result.complianceReason}. Routing to publisher with aiFailed: true.`);
      return {
        compliancePassed: true, // force routing to publisher
        aiFailed: true,
        complianceReason: result.complianceReason
      };
    }

    const currentRetryCount = state.retryCount || 0;
    if (currentRetryCount < 2) {
      console.log(`Compliance failed. Auto-retrying (Attempt ${currentRetryCount + 1}/2). Reason: ${result.complianceReason}`);
      return {
        compliancePassed: false,
        complianceReason: result.complianceReason,
        retryCount: currentRetryCount + 1
      };
    }

    console.log("HIL Triggered: Max auto-retries reached or HIL explicitly required.");
    
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
  .addNode("researcher", researcherNode)
  .addNode("strategist", strategistNode)
  .addNode("copywriter", copywriterNode)
  .addNode("assetCurator", assetCuratorNode)
  .addNode("designer", designerNode)
  .addNode("complianceCheck", complianceCheckNode)
  .addNode("publisher", publisherNode)

  // Define edges
  .addEdge(START, "coordinator")
  .addEdge("coordinator", "researcher")
  .addEdge("researcher", "strategist")
  .addEdge("strategist", "copywriter")
  // Conditional router after copywriter: if AI failed, skip to publisher immediately
  .addConditionalEdges(
    "copywriter",
    (state: any) => state.aiFailed ? "failed" : "continue",
    {
      failed: "publisher",
      continue: "assetCurator"
    }
  )
  .addEdge("assetCurator", "designer")
  .addEdge("designer", "complianceCheck")
  
  // Conditional router after compliance check
  .addConditionalEdges(
    "complianceCheck",
    (state: any) => {
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
}) as any;
