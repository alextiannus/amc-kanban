import { prisma } from "../../lib/prisma.ts";
import { generateText } from "../../lib/gemini.ts";

export async function copywriterNode(state: any) {
  console.log("=== CopywriterNode Running (Composition Mode) ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform, researchNotes, marketingStrategy } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId }
  });

  const task = await prisma.workUnit.findUnique({
    where: { id: taskId }
  });

  if (!brand || !task) {
    throw new Error("Brand or Task not found in database.");
  }

  // Load draft details if draftId exists to verify media availability
  let existingDraftId = state.draftId || null;
  if (!existingDraftId && task) {
    const match = `${task.description || ""} ${task.materials || ""}`.match(/(?:草稿|Draft)\s*ID:\s*([a-z0-9]{25,})/i);
    if (match) {
      existingDraftId = match[1];
    }
  }

  let draftCaption = "";
  let draftMediaUrls: string[] = [];
  if (existingDraftId) {
    try {
      const draft = await prisma.contentDraft.findUnique({
        where: { id: existingDraftId }
      });
      if (draft) {
        draftCaption = draft.caption || "";
        draftMediaUrls = draft.mediaUrls || [];
      }
    } catch (err) {
      console.error("Failed to fetch draft in copywriterNode:", err);
    }
  }

  // Check if draft has no media assets attached
  if (existingDraftId && draftMediaUrls.length === 0) {
    console.log(`Copywriter: No media files found in draft ${existingDraftId}. Suspending with warning.`);
    await prisma.contentDraft.update({
      where: { id: existingDraftId },
      data: {
        caption: "【AI 提示：请先选择或上传配图/视频再进行 AI 创作】"
      }
    });
    await prisma.workUnit.update({
      where: { id: taskId },
      data: {
        status: "pending",
        requiredInput: "【AI 创作提醒】未检测到配图或视频。请先在草稿中选择或上传配图/视频，然后再点击 AI 创作。"
      }
    });
    return {
      status: "pending",
      error: "Missing attached assets"
    };
  }

  let userPrompt = "";
  if (draftCaption && draftCaption !== "【AI 正在创作中...】") {
    userPrompt = draftCaption.trim();
  }

  // Retrieve attached assets metadata for multi-modal context alignment
  let attachedAssetsText = "";
  if (draftMediaUrls && draftMediaUrls.length > 0) {
    try {
      const attachedAssets = await prisma.mediaAsset.findMany({
        where: {
          brandId,
          url: { in: draftMediaUrls }
        }
      });
      if (attachedAssets.length > 0) {
        attachedAssetsText = "\nHere are the attached images for this post. You MUST write the caption and tags based on these images:\n" +
          attachedAssets.map((asset, idx) => `[Image ${idx + 1}]
URL: ${asset.url}
Tags: ${asset.aiTags.join(", ") || "N/A"}
Category: ${asset.aiCategory || "N/A"}
Description: ${asset.aiCaption || "N/A"}`).join("\n") + "\n";
      } else {
        attachedAssetsText = `\nThere are ${draftMediaUrls.length} images attached to this post (URLs: ${draftMediaUrls.join(", ")}). Please compose the content to match these visual assets.\n`;
      }
    } catch (err) {
      console.error("Failed to query media asset metadata in copywriterNode:", err);
      attachedAssetsText = `\nThere are ${draftMediaUrls.length} images attached to this post (URLs: ${draftMediaUrls.join(", ")}). Please compose the content to match these visual assets.\n`;
    }
  }

  // 2. Attempt AI Generation with Gemini using state.researchNotes & state.marketingStrategy
  let aiCaption = "";
  let aiHashtags: string[] = [];
  let geminiUsed = false;

  const prompt = `You are a professional social media manager and copywriter for the brand "${brand.name}".
Brand Description: ${brand.description || "A premium brand."}
Target Platform: ${platform}
Active Task/Topic: "${task.title}"
Task Details: ${task.description || "Create an engaging post."}
${userPrompt ? `User Prompt/Theme/Instruction: "${userPrompt}"` : ""}
${attachedAssetsText}

--- BRAND RESEARCH CONTEXT ---
${researchNotes || "No specific brand research available."}

--- BRAND MARKETING STRATEGY & GUIDELINES ---
${marketingStrategy || "No specific marketing guidelines available."}

Goal: Generate an extremely engaging social media post caption and relevant hashtags optimized for "${platform}". 
The post must be tailored to Singlish, bilingual English/Chinese, or Chinese based on the platform and localized context (e.g. use "Don't say bojio", "Chope your seats" for Instagram/TikTok if appropriate).

Instructions:
1. Make the copy highly engaging, natural, and customized to the brand's industry.
2. Alignment with Images: You MUST analyze the details of the attached images provided above. Ensure the caption's description matches the visual contents of the images (e.g., if the image shows a specific flavor of food or reformer pilates movement, describe exactly that; do not write about steak if the image shows a burger). Avoid generic filler copy.
3. Direct copy only. Do NOT include markdown styling, emojis in hashtags, or wrapper texts like "Sure, here is your post:".
4. Return the output in JSON format with two keys:
   "caption": The generated post caption (string)
   "hashtags": An array of hashtags (array of strings, without the '#' symbol)
Please output ONLY a valid JSON object.`;

  try {
    const responseText = await generateText(prompt, 800);
    if (responseText) {
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.caption) {
        aiCaption = parsed.caption;
        aiHashtags = parsed.hashtags || [];
        geminiUsed = true;
        console.log("AI Copywriter generated optimized content successfully using Gemini, Research, and Strategy.");
      }
    }
  } catch (error) {
    console.error("Failed to generate or parse Gemini copywriter response:", error);
  }

  // 3. Fallback Rule-Based Generation (Runs if Gemini fails)
  if (!geminiUsed) {
    console.log("Falling back to rule-based copywriter templates.");
    const brandName = brand.name;

    // Detect industry from strategy content for fallback hashtags selection
    const strategyLower = (marketingStrategy || "").toLowerCase();
    let detectedIndustry = "general";
    if (strategyLower.includes("pilates") || strategyLower.includes("fitness")) {
      detectedIndustry = "fitness";
    } else if (strategyLower.includes("renovation") || strategyLower.includes("steel")) {
      detectedIndustry = "renovation";
    } else if (strategyLower.includes("winery") || strategyLower.includes("wine")) {
      detectedIndustry = "winery";
    }

    aiCaption = `【${platform}风格】Welcome to ${brandName}! Specially crafted for those who seek excellence.`;

    if (detectedIndustry === "fitness") {
      aiHashtags = ["sgfitness", "sgpilates", "workout", brandName.replace(/\s+/g, "").toLowerCase(), "singaporefit"];
    } else if (detectedIndustry === "renovation") {
      aiHashtags = ["sgrenovation", "sginterior", "homedecor", brandName.replace(/\s+/g, "").toLowerCase(), "singaporehome"];
    } else if (detectedIndustry === "winery") {
      aiHashtags = ["sgwine", "sgwinery", "winetasting", brandName.replace(/\s+/g, "").toLowerCase(), "singaporewine"];
    } else {
      aiHashtags = ["sgfood", "sgfoodie", "instafood", brandName.replace(/\s+/g, "").toLowerCase(), "singaporeeat"];
    }

    const taskTitle = task.title;
    if (taskTitle.toLowerCase().includes("burgers") || taskTitle.toLowerCase().includes("汉堡")) {
      aiCaption = `Welcome to ${brandName}! Chope your seats for our mouthwatering Wagyu Burgers. Specially crafted for local foodies who love that authentic taste!`;
    }
  }

  console.log("Copywriter final caption preview:", aiCaption.split("\n")[0]);

  return {
    caption: aiCaption,
    hashtags: aiHashtags
  };
}
