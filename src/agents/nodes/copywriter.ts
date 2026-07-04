import { prisma } from "../../lib/prisma.ts";
import { callLLM } from "../../lib/llmRouter.ts";
import { getFewShotExamples } from "../../lib/feedbackService.ts";
import { getJaccardSimilarity } from "../knowledgeBase.ts";
import { loadPlatformSkill, formatSkillForPrompt } from "../skills/skillLoader.ts";
import { tryGenerateWithAmcContent } from "../../lib/amc-content/legacyCopywriterBridge.ts";

export async function copywriterNode(state: any) {
  console.log("=== CopywriterNode Running (Composition Mode) ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform, researchNotes, marketingStrategy } = state;
  const platformLower = (platform || "").toLowerCase();
  const isRednote = platformLower === "xiaohongshu" || platformLower === "red" || platformLower === "xhs";

  // Load platform-specific skill (AIERA v2)
  const platformSkill = await loadPlatformSkill(platformLower)
  const skillPromptBlock = formatSkillForPrompt(platformSkill)

  if (!brandId) {
    throw new Error("Missing brandId in state.");
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { knowledge: true }
  });

  if (!brand) {
    throw new Error("Brand not found in database.");
  }

  const systemCopywriter = await prisma.user.findFirst({
    where: { email: 'copywriter@platform.amc', type: 'AI_AGENT' }
  });
  const customPersona = systemCopywriter?.introduction ? `[Platform AI persona]:\n${systemCopywriter.introduction}\n` : "";
  const customSystemPrompt = systemCopywriter?.workflow ? `[Platform AI system instructions]:\n${systemCopywriter.workflow}\n` : "";
  const dbPromptInstructions = (customPersona || customSystemPrompt) 
    ? `${customPersona}\n${customSystemPrompt}\n`
    : "";

  const task = taskId ? await prisma.workUnit.findUnique({
    where: { id: taskId }
  }) : null;

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
  let draftObj: any = null;
  if (existingDraftId) {
    try {
      const draft = await prisma.contentDraft.findUnique({
        where: { id: existingDraftId },
        include: {
          assetRefs: {
            include: { asset: true }
          }
        }
      });
      if (draft) {
        draftObj = draft;
        draftCaption = draft.caption || "";
        const urlAssets = draft.mediaUrls || [];
        const refAssets = (draft as any).assetRefs?.map((r: any) => r.asset?.url).filter(Boolean) || [];
        draftMediaUrls = Array.from(new Set([...urlAssets, ...refAssets]));
      }
    } catch (err) {
      console.error("Failed to fetch draft in copywriterNode:", err);
    }
  }

  let userPrompt = "";
  let creativeHooks = "";
  if (draftObj) {
    if (draftObj.creativeHooks) {
      creativeHooks = draftObj.creativeHooks.trim();
    }
    if (draftObj.agentNote && draftObj.agentNote.includes("【AI 生成指令】")) {
      const match = draftObj.agentNote.match(/【AI 生成指令】([\s\S]*?)【\/AI 生成指令】/);
      if (match) {
        userPrompt = match[1].trim();
      }
    }
    if (!userPrompt && draftCaption && draftCaption !== "【AI 正在创作中...】") {
      userPrompt = draftCaption.trim();
    }
  }
  if (!userPrompt && state.caption && state.caption !== "【AI 正在创作中...】") {
    userPrompt = state.caption.trim();
  }
  if (!creativeHooks && task && task.description) {
    const match = task.description.match(/(?:创意\s*hooks|Creative\s*Hooks)\s*:\s*([\s\S]+?)(?:\n|$)/i);
    if (match) {
      creativeHooks = match[1].trim();
    }
  }

  // Retrieve attached assets metadata for multi-modal context alignment
  let attachedAssetsText = "";
  let attachedAssetRecords: Array<{
    id?: string;
    url: string;
    mimeType?: string;
    aiTags?: string[];
    aiCategory?: string | null;
    aiCaption?: string | null;
  }> = [];
  const mediaUrlsToUse = (draftMediaUrls && draftMediaUrls.length > 0) ? draftMediaUrls : (state.mediaUrls || []);
  if (mediaUrlsToUse && mediaUrlsToUse.length > 0) {
    try {
      const attachedAssets = await prisma.mediaAsset.findMany({
        where: {
          brandId,
          url: { in: mediaUrlsToUse }
        }
      });
      attachedAssetRecords = attachedAssets.map((asset: any) => ({
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        aiTags: asset.aiTags,
        aiCategory: asset.aiCategory,
        aiCaption: asset.aiCaption,
      }));
      if (attachedAssets.length > 0) {
        attachedAssetsText = "\nHere are the attached images for this post. You MUST write the caption and tags based on these images:\n" +
          attachedAssets.map((asset: any, idx: number) => `[Image ${idx + 1}]
URL: ${asset.url}
Tags: ${asset.aiTags.join(", ") || "N/A"}
Category: ${asset.aiCategory || "N/A"}
Description: ${asset.aiCaption || "N/A"}`).join("\n") + "\n";
      } else {
        attachedAssetsText = `\nThere are ${mediaUrlsToUse.length} images attached to this post (URLs: ${mediaUrlsToUse.join(", ")}). Please compose the content to match these visual assets.\n`;
      }
    } catch (err) {
      console.error("Failed to query media asset metadata in copywriterNode:", err);
      attachedAssetsText = `\nThere are ${mediaUrlsToUse.length} images attached to this post (URLs: ${mediaUrlsToUse.join(", ")}). Please compose the content to match these visual assets.\n`;
    }
  }

  // 1. Fetch custom brand context parameters if BrandKnowledge exists
  let brandToneText = "";
  let brandContactText = "";
  let menuText = "";
  let slangText = "";
  let negativePromptText = "";

  if (brand) {
    const details: string[] = [];
    if (brand.address) details.push(`Address: ${brand.address}`);
    if (brand.location) details.push(`Location/Area: ${brand.location}`);
    if (brand.website) details.push(`Website: ${brand.website}`);
    if (brand.phone) details.push(`Phone: ${brand.phone}`);
    if (details.length > 0) {
      brandContactText = `\nBrand Contact & Location Information:\n` + details.map((d: string) => `- ${d}`).join("\n") + "\n";
    }

    if (brand.knowledge) {
      const k = brand.knowledge;
      if (k.brandTone) {
        brandToneText = `\nBrand Tone/Voice: ${k.brandTone}\n`;
      }
      if (k.menuItems) {
        const menu = k.menuItems as any[];
        if (menu.length > 0) {
          menuText = `\nMenu Items Knowledge:\n` + menu.map((item: any) => `- ${item.name} ($${item.price}): ${item.description || ""}`).join("\n") + "\n";
        }
      }
      if (k.slangDict) {
        const slang = k.slangDict as Record<string, string>;
        slangText = `\nTarget Local Slang/Terminology mappings to use:\n` + Object.entries(slang).map(([key, val]) => `- "${key}": ${val}`).join("\n") + "\n";
      }
      if (k.negPrompts && k.negPrompts.length > 0) {
        negativePromptText = `\nNEVER use the following words or phrases:\n` + k.negPrompts.map((word: any) => `- "${word}"`).join("\n") + "\n";
      }
    }
  }

  // 2. Fetch approved corrections and perform Jaccard-similarity Few-Shot sorting
  let fewShotText = "";
  try {
    const allApproved = await prisma.userCorrectionFeedback.findMany({
      where: { brandId, isApproved: true },
      select: { originalText: true, correctedText: true }
    });
    if (allApproved.length > 0) {
      const taskQuery = task ? `${task.title} ${task.description || ""}` : (userPrompt || "");
      const sortedShots = [...allApproved].sort((a, b) => {
        const simA = getJaccardSimilarity(a.originalText + " " + a.correctedText, taskQuery);
        const simB = getJaccardSimilarity(b.originalText + " " + b.correctedText, taskQuery);
        return simB - simA;
      });
      const topShots = sortedShots.slice(0, 3);
      fewShotText = "\n--- BRAND PREFERRED STYLE EXAMPLES (FEW-SHOT CORRECTIONS) ---\n" +
        topShots.map((shot: any, idx: number) => `Example ${idx + 1}:\n[AI Original generated text]: ${shot.originalText}\n[User Preferred published text]: ${shot.correctedText}`).join("\n\n") + "\n";
    }
  } catch (err) {
    console.error("Failed to fetch custom few-shot examples:", err);
  }

  // Refinement prompt if compliance failed previously
  let refinementPromptText = "";
  if (state.complianceReason && !state.compliancePassed) {
    refinementPromptText = `\n--- REFINEMENT REQUEST ---\nYour previous generated caption failed compliance checks with the following reason:\n"${state.complianceReason}"\n\nPrevious Caption: "${state.caption}"\n\nYou MUST rewrite the caption, strictly avoiding the violation. Fix any superlative or Halal violations directly while preserving the marketing message.\n`;
  }

  let formattedResearchNotes = "";
  if (researchNotes) {
    formattedResearchNotes = `\n--- BRAND HISTORICAL ANALYTICS & OPERATIONAL MEMORY (RESEARCH NOTES) ---\n${researchNotes}\n`;
  }

  let aiCaption = "";
  let aiHashtags: string[] = [];
  let geminiUsed = false;

  if (process.env.AMC_CONTENT_ENGINE_ENABLED !== 'false') {
    try {
      const amcContentResult = await tryGenerateWithAmcContent({
        brand,
        platform,
        task,
        userPrompt,
        creativeHooks,
        marketingStrategy,
        draftId: existingDraftId,
        mediaUrls: mediaUrlsToUse,
        attachedAssets: attachedAssetRecords,
        assigneeId: state.assigneeId,
      });

      if (amcContentResult) {
        console.log(
          `AI Copywriter generated via amc-content: platform=${amcContentResult.platform}, vertical=${amcContentResult.vertical}, quality=${amcContentResult.quality.score}`,
        );
        return {
          caption: amcContentResult.caption,
          hashtags: amcContentResult.hashtags,
          aiFailed: false,
          quality: amcContentResult.quality,
          provenance: amcContentResult.provenance,
          contentEngine: 'amc-content',
        };
      }
    } catch (err) {
      console.error("amc-content generation failed; falling back to legacy copywriter:", err);
    }
  }

  // --- STAGE 1: HOOK GENERATION ---
  const hookPrompt = `${dbPromptInstructions}You are a professional social media manager and copywriter for the brand "${brand.name}".
Brand Description: ${brand.description || "A premium brand."}
Target Platform: ${platform}
Language Rule:
- For Xiaohongshu (小红书/Rednote, platform is "red", "xiaohongshu", or "xhs"): You MUST write the content in Simplified Chinese (中文) by default.
- For all other platforms (Instagram, Facebook, TikTok, Google Business Profile): You MUST write the content in English (英文) by default.
Active Task: "${task?.title || 'Social Media Post Content Creation'}"
Task Details: ${task?.description || ""}
${userPrompt ? `User Custom Theme / Creative Idea: "${userPrompt}"` : ""}
${creativeHooks ? `Creative Hooks / Writing Angles: "${creativeHooks}"` : ""}
${attachedAssetsText}
${brandToneText}
${brandContactText}
${menuText}
${slangText}
${negativePromptText}
${fewShotText}
${refinementPromptText}
${formattedResearchNotes}
${skillPromptBlock}
Goal: Generate 3 different engaging hook variants (opening lines/titles) optimized for "${platform}".
CRITICAL REQUIREMENT:
You MUST base the hooks directly on the "User Custom Theme / Creative Idea"${creativeHooks ? ` and "Creative Hooks / Writing Angles"` : ''} provided above. Do NOT write generic hooks. Your generated hooks must strongly reflect these ideas, angles, and specific writing directions. This is the most important constraint.

Rules:
1. Catchy and high click-through-rate.
2. HOOK DIVERSITY — MANDATORY: Each of the 3 hooks MUST use a completely DIFFERENT formula/category. Do NOT use the same opening pattern, sentence structure, or emotional angle more than once across the 3 hooks.
3. Platform-native visual formatting:
   - For Xiaohongshu (小红书/Rednote) (Note: MUST generate in Simplified Chinese):
     * Must start with highly eye-catching emojis (e.g. 🔥, 😭, 😱, 📍, 🌟, ⚠️, 🧐, 👀, 💥, 🤯).
     * Must end with double exclamation marks ("！！").
     * Pick ONE formula per hook from the categories below. Each hook must use a DIFFERENT category:

       CATEGORY A — 惊喜/震惊 (Surprise/Disbelief):
       - "天呐！[Brand]的[Feature]真的太[Adjective]了！！"
       - "直接封神！这家[Type]让我当场泪目！！"
       - "被惊到了！[Feature]居然可以这么[Adjective]！！"

       CATEGORY B — 地理/打卡 (Local Geo / Check-in):
       - "[Location]宝藏店！附近[Target]必打卡！！"
       - "[Location]这家店彻底拿捏我了！！"
       - "住在[Location]的宝子们有福了！[Brand]真的太[Adjective]！！"

       CATEGORY C — FOMO/紧迫 (FOMO / Urgency):
       - "听我的！去[Brand]之前一定要看这篇！！"
       - "Bojio！！[Brand]这个[Feature]我憋了好久了终于要分享了！！"
       - "悄悄告诉你们这个消息，[Brand]现在[Event]！千万别错过！！"

       CATEGORY D — 痛点共鸣 (Pain-point Resonance):
       - "老是[Problem]的[TargetGroup]，这家店是救星！！"
       - "后悔没早点知道[Brand]！！[Problem]的朋友看过来！！"
       - "[Problem]？！来[Brand]一次就解决了！！"

       CATEGORY E — 反常识/冲突 (Counter-intuitive / Conflict):
       - "别再相信那些[CommonMistake]了！！[Brand]教我重新认识[Topic]！！"
       - "打破认知！！原来[Topic]可以这样[UnexpectedWay]！！"
       - "我以为[WrongBelief]，结果[Brand]让我傻眼了！！"

   - For Instagram/TikTok/Facebook/Google Business (Note: MUST generate in English):
     * Write an intriguing, premium, and direct opening sentence.
     * Each of the 3 hooks must use a different angle: (1) curiosity/intrigue, (2) direct benefit/value prop, (3) social proof/FOMO.
     * Must be punchy and fit within 80-125 characters.
4. Brand Context and Visual Integration:
   - Carefully review the brand context details (tone, menu, contact, location) and attached images' metadata.
   - If any physical location, landmark, neighborhood, or brand address/location is specified, you MUST naturally integrate these into the hook variants.
5. STRICT Negative prompt: Never reuse the same opening word, emoji sequence, or sentence structure between the 3 hooks. Avoid clichés like "Discover the secrets...", "The best...". Do not use cringe or over-the-top AI language.
6. Use historical analytics and top-performing posts in Research Notes to guide hook structure.
7. Output your response as a JSON array of strings:
   ["Hook 1 (Category A or different)", "Hook 2 (different category)", "Hook 3 (different category)"]
Please output ONLY a valid JSON array of strings.`;

  let generatedHooks: string[] = [];
  let hookError = "";
  try {
    const hookResult = await callLLM("copywriting", hookPrompt, 800);
    if (hookResult.error) {
      hookError = hookResult.error;
    }
    if (hookResult.text) {
      const cleanJson = hookResult.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedHooks = parsed;
        console.log(`AI Copywriter Hook stage generated ${parsed.length} hooks successfully.`);
      }
    }
  } catch (err) {
    console.error("Failed to generate hooks in Stage 1:", err);
  }

  if (generatedHooks.length === 0) {
    generatedHooks = [
      isRednote ? `🔥 抢先打卡！这家店的招牌真的绝了！` : `Chope your seats! Something exciting is cooking at ${brand.name}.`
    ];
  }

  const selectedHook = generatedHooks[Math.floor(Math.random() * generatedHooks.length)]
  console.log(`AI Copywriter: randomly selected hook [${generatedHooks.indexOf(selectedHook) + 1}/${generatedHooks.length}]: "${selectedHook.slice(0, 60)}..."`)

  // --- STAGE 2: BODY & CTA GENERATION ---
  const bodyPrompt = `${dbPromptInstructions}You are a professional social media manager and copywriter for the brand "${brand.name}".
Brand Description: ${brand.description || "A premium brand."}
Target Platform: ${platform}
Language Rule:
- For Xiaohongshu (小红书/Rednote, platform is "red", "xiaohongshu", or "xhs"): You MUST write the content in Simplified Chinese (中文) by default.
- For all other platforms (Instagram, Facebook, TikTok, Google Business Profile): You MUST write the content in English (英文) by default.
Active Task: "${task?.title || 'Social Media Post Content Creation'}"
Task Details: ${task?.description || ""}
${userPrompt ? `User Custom Theme / Creative Idea: "${userPrompt}"` : ""}
${creativeHooks ? `Creative Hooks / Writing Angles: "${creativeHooks}"` : ""}
${attachedAssetsText}
${brandToneText}
${brandContactText}
${menuText}
${slangText}
${negativePromptText}
${fewShotText}
${refinementPromptText}
${formattedResearchNotes}
${skillPromptBlock}
Here is the approved Hook (opening line/title) generated for this post:
"${selectedHook}"

Goal: Compose the full social media post caption and hashtags starting with (or directly using) the hook above.
CRITICAL REQUIREMENT:
You MUST craft the copywriting to strictly follow and align with the "User Custom Theme / Creative Idea"${creativeHooks ? ` and "Creative Hooks / Writing Angles"` : ''} provided above. Make sure the marketing angle, messaging, and narrative focus directly on these specified ideas. Do not write generic or filler text.

Guidelines:
1. Tone & Perspective Switch:
   Analyze the Brand Tone/Voice setting. Adopt the requested persona:
   - If Tone suggests chef/owner/maker perspective (e.g. contains "chef", "owner", "我", "老板"), write in the first-person singular ("我今天亲自...").
   - If Tone suggests explorer/food blogger perspective (e.g. contains "blogger", "探店", "recommend"), write in the third-person explorer perspective ("这家店绝了...").
   - Else, write in the official brand/corporate perspective ("我们很高兴为您呈献...").
2. Brand Context, Location & Image Alignment:
   - You MUST craft the copywriting according to:
     a) The brand context (tagline, tone, menu items, slang dictionary, and especially physical address and location/neighborhood).
     b) The "User Custom Theme / Creative Idea" (${userPrompt ? `"${userPrompt}"` : 'none'}) and "Creative Hooks / Writing Angles" (${creativeHooks ? `"${creativeHooks}"` : 'none'}).
     c) The attached images' information (AI tags, categories, visual descriptions/captions, and any location or address details found in image tags or descriptions).
   - Carefully inspect if the attached images' tags or descriptions contain any physical locations, neighborhood names, cities, landmarks, or addresses (e.g., Singapore Clarke Quay, etc.). If they do, or if the brand's primary address/location is specified in the brand contact info:
     * You MUST naturally and prominently integrate these location/address/neighborhood details into the post body or Call to Action (e.g., inviting customers to visit, using location pin emoji 📍 like "📍 地址：[Address]", etc.).
     * Make sure your text references specific visual elements or location details portrayed in the images accurately.
3. Include a compelling Call to Action (CTA) at the end:
   - For F&B/restaurants/cafes: naturally invite them to book a table, visit the store, check the website, or highlight active promos. Include the address (or landmark/location) and website/phone naturally.
   - For Google Business Profile: Ensure the post is professional, location-centric, and details how to visit or contact (address, website link, phone).
   - For others: prompt for bookings/inquiries.
4. Platform-Native Formatting & Layout Rules:
   - For Xiaohongshu (小红书/Rednote) (Note: MUST generate in Simplified Chinese):
     * High Density Emojis: Use emojis as visual separator markers for list items (e.g. ✨, 👉, ✅, 📌, 💡, ▫️) instead of default markdown dashes.
     * Location details: If an address/location is available, include it with a map pin emoji (e.g., '📍地址：[Address]').
     * Easy Reading: Break text into short, 1-2 sentence paragraphs separated by a full blank line. Do not write large dense blocks of text.
     * Conversational Tone: Use friendly, colloquial styles (e.g. "家人们", "姐妹们", "宝子们") and naturally integrate local Singlish slang (e.g. "Bojio", "Shiok", "Chope") if defined in slangDict.
     * Hashtags: Output hashtags at the very bottom, space-separated (e.g. "#新加坡美食 #克拉码头").
   - For Instagram (Note: MUST generate in English):
     * Write inviting, premium English copywriting.
     * Spacing: Enforce clean double line breaks between sections to avoid crowded layouts.
     * Bullet points: Use custom character bullet points (e.g. •, ▫️) for lists.
     * Location/Address: Include the store address or neighborhood naturally near the CTA.
     * Hashtags: Output hashtags neatly at the bottom separated from the caption by line breaks.
   - For Facebook / TikTok (Note: MUST generate in English):
     * Write inviting, premium English social copy.
     * Include address/contact info naturally.
     * Hashtags: Output hashtags neatly at the bottom.
   - For Google Business Profile (Note: MUST generate in English):
     * Professional, concise, focus on booking details, contact info, and clear promotion terms.
6. Reference and utilize the Research Notes (historical top-performing posts, brand documents, and memory feedback logs) to maintain style consistency and avoid past mistakes.
5. Output your response in JSON format with two keys:
   "caption": The complete post caption (string)
   "hashtags": An array of hashtags (array of strings, without the '#' symbol)
Please output ONLY a valid JSON object.`;

  let bodyError = "";
  try {
    const bodyResult = await callLLM("copywriting", bodyPrompt, 1000);
    if (bodyResult.error) {
      bodyError = bodyResult.error;
    }
    if (bodyResult.text) {
      const cleanJson = bodyResult.text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.caption) {
        aiCaption = parsed.caption;
        aiHashtags = parsed.hashtags || [];
        geminiUsed = true;
        console.log(`AI Copywriter Body stage generated decoupled content successfully using: ${bodyResult.provider}/${bodyResult.modelName}`);

        // Record log to database
        const finalRawOutput = JSON.stringify({ caption: aiCaption, hashtags: aiHashtags });
        prisma.copywriterLog.create({
          data: {
            brandId,
            userId: state.assigneeId || 'copywriter@platform.amc',
            systemPrompt: bodyPrompt.slice(0, 20000),
            userInput: (userPrompt || task?.title || 'Unknown Theme').slice(0, 5000),
            rawOutput: finalRawOutput,
            modelId: bodyResult.modelName || 'gemini',
            platform: platform || 'all',
            draftId: existingDraftId || null,
            promptVersion: systemCopywriter?.updatedAt ? `platform_${systemCopywriter.updatedAt.getTime()}` : 'platform_v1',
          }
        }).catch((err: any) => {
          console.error('[CopywriterLog] background save failed:', err);
        });
      }
    }
  } catch (error) {
    console.error("Failed to generate body caption in Stage 2:", error);
  }

  // 3. Fallback Rule-Based Generation (Runs if Gemini fails)
  if (!geminiUsed) {
    console.log("Falling back to rule-based copywriter templates.");
    const brandName = brand.name;
    const themeText = userPrompt ? userPrompt : "高品质服务与体验";
    const hooksText = creativeHooks ? ` (${creativeHooks})` : "";

    // Platform-specific fallback generation
    const addressStr = brand.address ? `\n\n📍 店铺地址：${brand.address}` : "";
    let contactStr = "";
    if (brand.address) contactStr += `\n📍 Address: ${brand.address}`;
    if (brand.phone) contactStr += `\n📞 Phone: ${brand.phone}`;
    if (brand.website) contactStr += `\n🌐 Website: ${brand.website}`;

    if (platformLower === "xiaohongshu" || platformLower === "red" || platformLower === "xhs") {
      aiCaption = `🔥 我不允许还有人不知道这家宝藏店铺！\n\n📍 ${brandName} 带来全新企划：${themeText}！${hooksText}\n\n✨ 无论是高颜值环境还是精益求精的出品，都直接封神！！家人们闭眼冲就对了！${addressStr}\n\n📌 记得点赞收藏，防止找不到哦～`;
      aiHashtags = ["新加坡打卡", "宝藏店铺", brandName.replace(/\s+/g, "").toLowerCase(), "本地生活"];
    } else if (platformLower === "google_business" || platformLower === "google" || platformLower === "google_maps") {
      aiCaption = `Update from ${brandName}:\n\nWe are pleased to introduce our latest project: "${themeText}".${creativeHooks ? ` Focus: ${creativeHooks}.` : ""}\n\nExperience premium quality and dedicated local service at our location.${contactStr}\n\nVisit our website or contact us to book your reservation.`;
      aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase(), "localbusiness", "singapore"];
    } else {
      // Default to Instagram / Facebook / TikTok (English)
      aiCaption = `Chope your seats! Something exciting is cooking at ${brandName}: ${themeText}.\n\nSpecial angles: ${creativeHooks || 'Premium experience'}.\n\nTag a friend who needs to try this!${contactStr}`;
      
      const strategyLower = (marketingStrategy || "").toLowerCase();
      let detectedIndustry = "general";
      if (strategyLower.includes("pilates") || strategyLower.includes("fitness")) {
        detectedIndustry = "fitness";
      } else if (strategyLower.includes("renovation") || strategyLower.includes("steel")) {
        detectedIndustry = "renovation";
      } else if (strategyLower.includes("winery") || strategyLower.includes("wine")) {
        detectedIndustry = "winery";
      }

      if (detectedIndustry === "fitness") {
        aiHashtags = ["sgfitness", "sgpilates", "workout", brandName.replace(/\s+/g, "").toLowerCase(), "singaporefit"];
      } else if (detectedIndustry === "renovation") {
        aiHashtags = ["sgrenovation", "sginterior", "homedecor", brandName.replace(/\s+/g, "").toLowerCase(), "singaporehome"];
      } else if (detectedIndustry === "winery") {
        aiHashtags = ["sgwine", "sgwinery", "winetasting", brandName.replace(/\s+/g, "").toLowerCase(), "singaporewine"];
      } else {
        aiHashtags = ["sgfood", "sgfoodie", "instafood", brandName.replace(/\s+/g, "").toLowerCase(), "singaporeeat"];
      }
    }

    // Add error message prefix to alert user about insufficient tokens / invalid key / etc.
    const rawError = bodyError || hookError || "Gemini 接口调用失败，已自动降级为本地规则引擎进行创作。请检查 API Key 配置与额度是否充足。";
    const errorPrefix = `【⚠️ AI 智能写作未成功：${rawError}】\n\n`;
    aiCaption = errorPrefix + aiCaption;
  }

  console.log("Copywriter final caption preview:", aiCaption.split("\n")[0]);

  return {
    caption: aiCaption,
    hashtags: aiHashtags,
    aiFailed: !geminiUsed
  };
}
