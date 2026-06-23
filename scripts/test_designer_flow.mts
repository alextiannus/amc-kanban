import fs from "fs";
import path from "path";
import { marketingGraph } from "../src/agents/graph/marketingGraph.ts";
import { prisma } from "../src/lib/prisma.ts";
import { Command } from "@langchain/langgraph";

async function runTest() {
  console.log("================= Starting Visual Designer E2E Test =================");

  // 1. Setup mock brand with custom watermark padding and position
  const brand = await prisma.brand.upsert({
    where: { id: "test-brand-designer" },
    update: {
      logoUrl: "/next.svg",
      watermarkText: null, // Test default fallback to logoUrl first
      watermarkPosition: "bottom-right",
      watermarkOpacity: 0.7,
      watermarkPadding: 30
    },
    create: {
      id: "test-brand-designer",
      name: "Uncle Lim's Kitchen",
      description: "Singaporean Nanyang mixed rice, Halal compliant options",
      logoUrl: "/next.svg",
      watermarkPosition: "bottom-right",
      watermarkOpacity: 0.7,
      watermarkPadding: 30
    }
  });
  console.log("1. Brand configured:", brand.name);

  // 2. Create mock media asset (original high-res image)
  const coverAsset = await prisma.mediaAsset.create({
    data: {
      brandId: brand.id,
      url: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800",
      mimeType: "image/jpeg",
      aiReady: true,
      aiCategory: "raw_photos"
    }
  });
  await prisma.mediaAsset.create({
    data: {
      brandId: brand.id,
      url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
      mimeType: "image/jpeg",
      aiReady: true,
      aiCategory: "raw_photos"
    }
  });
  await prisma.mediaAsset.create({
    data: {
      brandId: brand.id,
      url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800",
      mimeType: "image/jpeg",
      aiReady: true,
      aiCategory: "raw_photos"
    }
  });
  console.log("2. Created raw photos assets (3 total) to satisfy Instagram limits.");

  // 3. Create task (violating Halal to force compliance interrupt so we can test resume-redesign)
  const task = await prisma.workUnit.create({
    data: {
      title: "Create instagram post about our crispy pork cutlet",
      description: "Emphasize succulent pork cutlet option",
      status: "todo",
      brandId: brand.id,
      tags: ["instagram", "halal"]
    }
  });
  console.log("3. Created task to trigger HIL:", task.id);

  const config = { configurable: { thread_id: `${brand.id}-${Date.now()}` } };

  // 4. Invoke graph
  console.log("4. Running graph (expecting compliance interrupt)...");
  const res = (await marketingGraph.invoke({
    taskId: task.id,
    brandId: brand.id
  }, config)) as any;

  if (res.__interrupt__ && res.__interrupt__.length > 0) {
    console.log("   -> Graph successfully suspended at compliance node.");
  } else {
    console.error("   -> FAILED: Graph did not suspend.");
    process.exit(1);
  }

  // Verify that designerNode ran on step 1 and saved a watermarked cover
  const state = await marketingGraph.getState(config);
  const initialCoverUrl = state.values.mediaUrls[0];
  console.log("5. Initial cover URL generated in state:", initialCoverUrl);
  if (initialCoverUrl && initialCoverUrl.startsWith("/uploads/watermarked/")) {
    const localPath = path.join(process.cwd(), "public", initialCoverUrl);
    if (fs.existsSync(localPath)) {
      console.log("   -> SUCCESS: Smart cropped cover image with logo watermark saved at:", localPath);
    } else {
      console.error("   -> FAILED: Watermarked file not found on disk:", localPath);
      process.exit(1);
    }
  } else {
    console.error("   -> FAILED: Initial mediaUrl index 0 is not watermarked.");
    process.exit(1);
  }

  // 6. Resume Graph with custom watermarkText provided by the Human Brand Manager (optional confirmation)
  const customWatermarkText = "Uncle Lim's 🇸🇬";
  console.log(`6. Resuming graph with human approval AND custom watermark text: "${customWatermarkText}"...`);
  
  const finalRes = (await marketingGraph.invoke(
    new Command({
      resume: {
        approved: true,
        comment: "Looks delicious! Overlay brand text instead.",
        watermarkText: customWatermarkText
      }
    }),
    config
  )) as any;

  console.log("7. Final Graph run completed.");
  console.log("   -> Final Status:", finalRes.status);
  console.log("   -> Published URL:", finalRes.publishedUrl);

  // 8. Verify the updated cover image with the custom text watermark
  const finalState = await marketingGraph.getState(config);
  const finalCoverUrl = finalState.values.mediaUrls[0];
  console.log("8. Final cover URL in state:", finalCoverUrl);

  if (finalCoverUrl && finalCoverUrl !== initialCoverUrl) {
    const finalLocalPath = path.join(process.cwd(), "public", finalCoverUrl);
    if (fs.existsSync(finalLocalPath)) {
      console.log("   -> SUCCESS: Redesigned cover image with custom text watermark saved at:", finalLocalPath);
    } else {
      console.error("   -> FAILED: Redesigned file not found on disk:", finalLocalPath);
      process.exit(1);
    }
  } else {
    console.error("   -> FAILED: Redesigned cover URL was not updated or matches initial.");
    process.exit(1);
  }

  // Cleanup DB
  await prisma.workUnit.delete({ where: { id: task.id } });
  await prisma.mediaAsset.deleteMany({ where: { brandId: brand.id } });
  await prisma.brand.delete({ where: { id: brand.id } });
  
  console.log("\n================= Visual Designer E2E Test SUCCESS =================");
  process.exit(0);
}

runTest().catch(e => {
  console.error(e);
  process.exit(1);
});
