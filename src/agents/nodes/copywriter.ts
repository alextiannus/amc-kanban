import { prisma } from "../../lib/prisma.ts";
import { postfastGetAnalytics } from "../../lib/integrations/postfast.ts";
import { generateText } from "../../lib/gemini.ts";
import { getRelevantKnowledge } from "../knowledgeBase.ts";

export async function copywriterNode(state: any) {
  console.log("=== CopywriterNode Running ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform } = state;

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

  console.log(`Copywriter creating content for Brand: ${brand.name}, Task: ${task.title}`);

  // 1. Gather historical/performance data for analytics-driven optimization
  let examplesText = "";
  let topPosts: { content: string; impressions: number; likes: number }[] = [];

  if (brand.postfastApiKey) {
    try {
      console.log(`Fetching PostFast analytics for Brand: ${brand.name}`);
      const analyticsRes = await postfastGetAnalytics(brand.postfastApiKey);
      if (analyticsRes.success && analyticsRes.posts && analyticsRes.posts.length > 0) {
        const parsedPosts = analyticsRes.posts.map(p => {
          const impressions = parseInt(p.latestMetric?.impressions || "0", 10);
          const likes = parseInt(p.latestMetric?.likes || "0", 10);
          return {
            content: p.content,
            impressions,
            likes
          };
        });
        // Sort descending by impressions, then by likes
        parsedPosts.sort((a, b) => b.impressions - a.impressions || b.likes - a.likes);
        topPosts = parsedPosts.slice(0, 3);
        console.log(`Successfully fetched ${topPosts.length} top-performing posts from PostFast.`);
      }
    } catch (err) {
      console.error("Failed to fetch PostFast analytics for copywriting:", err);
    }
  }

  if (topPosts.length > 0) {
    examplesText = "\nHere are the top-performing historical posts for this brand on this platform to guide you:\n" +
      topPosts.map((p, idx) => `[Example ${idx + 1}]\nMetrics: Impressions: ${p.impressions}, Likes: ${p.likes}\nContent: "${p.content}"\n`).join("\n");
  } else {
    // Fallback: fetch the last 3-5 published ContentDraft records from the database
    try {
      const historicalDrafts = await prisma.contentDraft.findMany({
        where: {
          brandId,
          status: "published"
        },
        orderBy: { publishedAt: "desc" },
        take: 5
      });
      if (historicalDrafts.length > 0) {
        examplesText = "\nHere are some of the brand's previously published posts to guide your style:\n" +
          historicalDrafts.map((d, idx) => `[Example ${idx + 1}]\nContent: "${d.caption}"\n`).join("\n");
      }
    } catch (err) {
      console.error("Failed to fetch historical ContentDrafts:", err);
    }
  }

  // Try to get requested industry from assignment decision logs to be as accurate as possible
  const decision = await prisma.assignmentDecisionLog.findFirst({
    where: { subjectId: brand.id },
    orderBy: { createdAt: 'desc' }
  })

  const nameLower = brand.name.toLowerCase()
  const descLower = (brand.description || '').toLowerCase()
  let detectedIndustry = decision?.requestedIndustry || 'General'

  if (detectedIndustry === 'General' || !detectedIndustry) {
    if (nameLower.includes('pilates') || nameLower.includes('普拉提') || descLower.includes('pilates') || descLower.includes('fitness') || descLower.includes('yoga')) {
      detectedIndustry = 'Pilates/Fitness'
    } else if (nameLower.includes('装修') || nameLower.includes('白钢') || nameLower.includes('renovation') || descLower.includes('renovation') || descLower.includes('interior')) {
      detectedIndustry = 'Home Renovation/Steel Work'
    } else if (nameLower.includes('winery') || nameLower.includes('酒') || descLower.includes('winery') || descLower.includes('wine')) {
      detectedIndustry = 'Winery/Beverages'
    } else if (nameLower.includes('seafood') || nameLower.includes('海鲜') || nameLower.includes('烤鱼') || nameLower.includes('restaurant') || nameLower.includes('饭') || nameLower.includes('菜') || descLower.includes('food') || descLower.includes('restaurant') || descLower.includes('dining')) {
      detectedIndustry = 'Food & Beverage'
    }
  }

  // Load relevant copywriting ideas, templates, video scripts, and specialized prompts from knowledge base
  const knowledge = getRelevantKnowledge(detectedIndustry, platform || "instagram", task.title + " " + (task.description || ""));

  // Format knowledge entries to inject into Gemini prompt
  const knowledgeText = `
Here is some context and assets from the brand's knowledge base that you MUST reference/use or adapt:
- Content Ideas to consider:
${knowledge.ideas.map(i => `  * ${i}`).join("\n")}

- Applicable Templates (adapt these formats or styles):
${knowledge.templates.map(t => `  * ${t}`).join("\n")}

- Video Script Blueprints (if this is for a video platform like TikTok/Instagram Reels/Shorts, or if a video script is needed):
${knowledge.videoScripts.map(s => `  * ${s}`).join("\n")}

- Specialized Prompt Rules/Guidelines:
${knowledge.prompts.map(p => `  * ${p}`).join("\n")}
`;

  // 2. Attempt AI Generation with Gemini
  let aiCaption = "";
  let aiHashtags: string[] = [];
  let geminiUsed = false;

  const prompt = `You are a professional social media manager and copywriter for the "${detectedIndustry}" brand "${brand.name}".
Brand Description: ${brand.description || `A premium brand in the ${detectedIndustry} industry.`}
Target Platform: ${platform}
Active Task/Topic: "${task.title}"
Task Details: ${task.description || "Create an engaging post."}

Goal: Generate an extremely engaging social media post caption and relevant hashtags optimized for "${platform}". 
The post must be tailored to Singlish, bilingual English/Chinese, or Chinese based on the platform and localized context (e.g. use "Don't say bojio", "Chope your seats" for Instagram/TikTok if appropriate).
${examplesText}
${knowledgeText}

Instructions:
1. Make the copy highly engaging, natural, and customized to the brand's industry (${detectedIndustry}).
2. Direct copy only. Do NOT include markdown styling, emojis in hashtags, or wrapper texts like "Sure, here is your post:".
3. Return the output in JSON format with two keys:
   "caption": The generated post caption (string)
   "hashtags": An array of hashtags (array of strings, without the '#' symbol)
Please output ONLY a valid JSON object.`;

  try {
    const responseText = await generateText(prompt, 800);
    if (responseText) {
      // Extract JSON if wrapped in code blocks
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.caption) {
        aiCaption = parsed.caption;
        aiHashtags = parsed.hashtags || [];
        geminiUsed = true;
        console.log("AI Copywriter generated optimized content successfully using Gemini and Knowledge Base.");
      }
    }
  } catch (error) {
    console.error("Failed to generate or parse Gemini copywriter response:", error);
  }

  // 3. Fallback Rule-Based Generation (Runs if Gemini is not configured or fails)
  if (!geminiUsed) {
    console.log("Falling back to rule-based copywriter templates using knowledge base.");
    const brandName = brand.name;
    const signature = brand.description || `premium ${detectedIndustry} services`;

    // Pick the first matched template from knowledge base
    const template = knowledge.templates[0] || "Welcome to [BrandName]! Specially crafted for those who seek excellence.";

    // Replace placeholders in the template
    let generatedCaption = template
      .replace(/\[BrandName\]/g, brandName)
      .replace(/\[Signature\]/g, signature)
      .replace(/\[Texture\]/g, "口感绝佳，每一口都是满满的幸福感");

    aiCaption = generatedCaption;

    // Generate fallback hashtags
    if (detectedIndustry.toLowerCase().includes('fitness') || detectedIndustry.toLowerCase().includes('pilates')) {
      aiHashtags = ["sgfitness", "sgpilates", "workout", brandName.replace(/\s+/g, "").toLowerCase(), "singaporefit"];
    } else if (detectedIndustry.toLowerCase().includes('renovation') || detectedIndustry.toLowerCase().includes('steel')) {
      aiHashtags = ["sgrenovation", "sginterior", "homedecor", brandName.replace(/\s+/g, "").toLowerCase(), "singaporehome"];
    } else if (detectedIndustry.toLowerCase().includes('winery') || detectedIndustry.toLowerCase().includes('wine')) {
      aiHashtags = ["sgwine", "sgwinery", "winetasting", brandName.replace(/\s+/g, "").toLowerCase(), "singaporewine"];
    } else {
      aiHashtags = ["sgfood", "sgfoodie", "instafood", brandName.replace(/\s+/g, "").toLowerCase(), "singaporeeat"];
    }

    // Adapt based on task title keywords
    const taskTitle = task.title;
    if (taskTitle.toLowerCase().includes("burgers") || taskTitle.toLowerCase().includes("汉堡")) {
      aiCaption = aiCaption.replace("dishes", "Wagyu Burgers").replace("特色菜", "多汁和牛堡");
    } else if (taskTitle.toLowerCase().includes("steak") || taskTitle.toLowerCase().includes("牛排")) {
      aiCaption = aiCaption.replace("dishes", "Ribeye Steaks").replace("特色菜", "炭烤沙朗牛排");
    } else if (taskTitle.toLowerCase().includes("coffee") || taskTitle.toLowerCase().includes("咖啡")) {
      aiCaption = aiCaption.replace("dishes", "Nanyang Kopi").replace("特色菜", "南洋传统咖啡");
    } else if (taskTitle.toLowerCase().includes("pork") || taskTitle.toLowerCase().includes("猪肉")) {
      const hasPorkViolation = state.complianceReason && state.complianceReason.toLowerCase().includes("pork");
      if (hasPorkViolation) {
        console.log("Copywriter: Pork violation detected in history. Generating Halal mock-meat alternative.");
        aiCaption = aiCaption.replace("dishes", "Crispy Mock Pork (Vegetarian / Halal)").replace("特色菜", "素脆皮炸肉 (清真)");
      } else {
        aiCaption = aiCaption.replace("dishes", "Crispy Pork Ribs").replace("特色菜", "脆皮炸猪肉");
      }
    } else if (taskTitle.toLowerCase().includes("best") || taskTitle.toLowerCase().includes("第一")) {
      aiCaption = aiCaption.replace("dishes", "Best items").replace("特色菜", "全岛第一招牌特色");
    }
  }

  console.log("Copywriter final caption preview:", aiCaption.split("\n")[0]);

  return {
    caption: aiCaption,
    hashtags: aiHashtags
  };
}
