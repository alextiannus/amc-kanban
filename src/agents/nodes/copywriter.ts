import { prisma } from "../../lib/prisma.ts";
import { callLLM } from "../../lib/llmRouter.ts";
import { getFewShotExamples } from "../../lib/feedbackService.ts";
import { getJaccardSimilarity } from "../knowledgeBase.ts";
import { buildBrandContext } from "@/lib/brandContextBuilder.ts";
import { loadPlatformSkill, formatSkillForPrompt } from "../skills/skillLoader.ts";
import { tryGenerateWithRemoteContentService } from "../../lib/amc-content/remoteContentService.ts";

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
      creativeHooks = sanitizeCreativeDirection(draftObj.creativeHooks);
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
      creativeHooks = sanitizeCreativeDirection(match[1]);
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

  // 1. Build unified brand context from all 4 knowledge sections
  const brandCtx = await buildBrandContext(brandId);
  const brandContextText = brandCtx.contextText
    ? `\n--- BRAND CONTEXT ---\n${brandCtx.contextText}\n--- END BRAND CONTEXT ---\n`
    : "";

  // Derived helpers for backward-compat variables still used below
  const brandToneText = brandCtx.brandTone ? `\nBrand Tone/Voice: ${brandCtx.brandTone}\n` : "";
  const negativePromptText = brand?.knowledge?.negPrompts?.length
    ? `\nNEVER use the following words or phrases:\n` + (brand.knowledge.negPrompts as string[]).map((w: string) => `- "${w}"`).join("\n") + "\n"
    : "";
  const menuText = "";
  const slangText = "";
  const brandContactText = "";

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
  const requireAmcContent = state.requireAmcContent === true;

  if (state.skipAmcContent || process.env.AMC_CONTENT_ENGINE_ENABLED === 'false') {
    if (requireAmcContent) {
      throw new Error("amc-content copywriter is required but disabled for this run.");
    }
  } else {
    try {
      const amcContentResult = await tryGenerateWithRemoteContentService({
        brandId,
        platform,
        theme: userPrompt || task?.title || task?.description || brand.description || `${brand.name} local service update`,
        idea: userPrompt,
        angle: creativeHooks || marketingStrategy,
        draftId: existingDraftId,
        mediaUrls: mediaUrlsToUse,
        assetIds: state.assetIds || attachedAssetRecords.map((asset) => asset.id).filter(Boolean),
        fallbackToLegacy: false,
        actorId: state.actorId || state.assigneeId,
        actorType: state.actorType || 'AI_AGENT',
        actorRole: state.actorRole || 'USER',
        copyScriptId: state.copyScriptId || draftObj?.viralCopyScriptId || undefined,
        copyScriptVersionId: state.copyScriptVersionId || draftObj?.viralCopyScriptVersionId || undefined,
        scriptSelection: (state.scriptSelection || draftObj?.viralCopyScriptSelection) === 'recommended' ? 'recommended' : 'manual',
      });

      if (amcContentResult) {
        console.log(
          `AI Copywriter generated via amc-content: platform=${platform}, quality=${(amcContentResult.quality as any)?.score ?? 'n/a'}`,
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
      if (requireAmcContent) {
        throw err;
      }
      console.error("amc-content generation failed; falling back to legacy copywriter:", err);
    }
  }

  if (requireAmcContent) {
    throw new Error(`amc-content copywriter did not generate content for platform "${platform}".`);
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
${brandContextText}
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
${brandContextText}
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
    const themeText = platformLower === "xiaohongshu" || platformLower === "red" || platformLower === "xhs"
      ? fallbackChineseTheme(userPrompt, creativeHooks)
      : fallbackEnglishTheme(userPrompt, creativeHooks);
    const englishAngle = fallbackEnglishTheme(creativeHooks, undefined);
    const proofText = fallbackConcreteProof(attachedAssetRecords, brandCtx.contextText, brand.description, brand.location || brand.address);

    if (platformLower === "xiaohongshu" || platformLower === "red" || platformLower === "xhs") {
      aiCaption = `📍${brandName} 最新本地生活更新\n\n这次重点是：${themeText}。\n\n适合正在附近找新选择、想提前了解亮点和到店信息的人。${brand.address ? `\n\n📍地址：${brand.address}` : ""}${brand.website ? `\n🌐 详情：${brand.website}` : ""}\n\n可以先收藏，需要时再打开看。`;
      aiHashtags = ["新加坡生活", "本地探店", brandName.replace(/\s+/g, "").toLowerCase(), "同城推荐"];
    } else if (platformLower === "google_business" || platformLower === "google" || platformLower === "google_maps") {
      aiCaption = `${brandName} local update\n\n${themeText}. ${englishAngle !== "a fresh local update" ? `Focus: ${englishAngle}. ` : ""}${brand.address ? `Visit us at ${brand.address}. ` : ""}${brand.location && !brand.address ? `Find us in ${brand.location}. ` : ""}${brand.website ? `Learn more on our website. ` : ""}Use the Google Business contact options to book, enquire, or get directions.`;
      aiHashtags = [];
    } else if (platformLower === "tiktok" || platformLower === "tt") {
      const lead = proofText || themeText;
      aiCaption = `${brandName} in 10 seconds: ${lead}.\n\nSave this for your next ${brand.location ? `${brand.location} ` : ""}stop.`;
      aiHashtags = tiktokFallbackHashtags(brandName, proofText || themeText, brand.location);
    } else if (platformLower === "facebook" || platformLower === "fb") {
      aiCaption = `Local update from ${brandName}\n\n${themeText}. ${brand.address || brand.location ? `If you are nearby, visit us${brand.address ? ` at ${brand.address}` : ` in ${brand.location}`}. ` : ""}${brand.website ? `Check our website for details, availability, or reservations. ` : ""}Tell us what you would like to try next.`;
      aiHashtags = ["Singapore", "LocalBusiness", brandName.replace(/\s+/g, "").toLowerCase()].slice(0, 3);
    } else {
      // Default to Instagram / Facebook / TikTok (English)
      aiCaption = `${themeText} at ${brandName}.\n\nA fresh local update with a clear reason to visit, save, or share.${brand.address || brand.location ? `\n\nFind us ${brand.address ? `at ${brand.address}` : `in ${brand.location}`}.` : ""}${brand.website ? `\n\nDetails: ${brand.website}` : ""}`;
      
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

    aiCaption = stripDisallowedFallbackText(platformLower, aiCaption);
    aiHashtags = normalizeFallbackHashtags(platformLower, aiHashtags);
  }

  console.log("Copywriter final caption preview:", aiCaption.split("\n")[0]);

  return {
    caption: aiCaption,
    hashtags: aiHashtags,
    aiFailed: !geminiUsed
  };
}

function sanitizeCreativeDirection(value: unknown): string {
  if (typeof value !== 'string') return "";
  const text = value.trim();
  if (!text) return "";
  if (/^(AI批量创作|Copywriter)\s*[·:：-]/i.test(text)) return "";
  if (/\bAI\s*[-·]\s*[\w\s]+\s*[-·]\s*(Instagram|TikTok|Facebook|Google|Xiaohongshu|Rednote)\s+Copywriter\b/i.test(text)) return "";
  if (/\bIMG_\d+\.(jpe?g|png|webp|mp4|mov)\b/i.test(text)) return "";
  return text;
}

function fallbackEnglishTheme(primary?: string, secondary?: string): string {
  const text = [primary, secondary].filter(Boolean).join(" ").trim();
  const price = text.match(/[$＄]\s?\d+(?:[.,]\d+)?/)?.[0];
  const hasOffer = /promo|offer|deal|discount|limited|优惠|活动|仅需|只要|特价|折扣/i.test(text);
  const hasFood = /food|menu|dish|restaurant|cafe|dining|餐|菜|烤|鱼|美食|味/i.test(text);
  const hasClass = /class|course|trial|pilates|yoga|fitness|课|课程|体验/i.test(text);

  if (hasFood && price) return `A limited-time dining update from ${price}`;
  if (hasFood && hasOffer) return "A limited-time dining update";
  if (hasFood) return "A new food and dining update";
  if (hasClass && price) return `A limited-time class update from ${price}`;
  if (hasClass) return "A new class and booking update";
  if (hasOffer && price) return `A limited-time local offer from ${price}`;
  if (hasOffer) return "A limited-time local offer";

  const englishOnly = text
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return englishOnly.length >= 8 ? englishOnly.slice(0, 120) : "a fresh local update";
}

function fallbackConcreteProof(
  assets: Array<{ aiTags?: string[]; aiCategory?: string | null; aiCaption?: string | null }>,
  brandContext?: string,
  brandDescription?: string | null,
  location?: string | null,
): string {
  const assetText = assets
    .flatMap((asset) => [
      asset.aiCaption,
      asset.aiCategory,
      ...(asset.aiTags || []),
    ])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(" ");
  const source = [assetText, brandContext, brandDescription, location].filter(Boolean).join(" ");
  const cleaned = source
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu, " ")
    .replace(/\b(a fresh local update|local update|quick local update|worth checking)\b/gi, " ")
    .replace(/[^\p{Letter}\p{Number}$%&.,' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 8) return "";
  return cleaned.length > 120 ? cleaned.slice(0, 117).trimEnd() + "..." : cleaned;
}

function tiktokFallbackHashtags(brandName: string, proof: string, location?: string | null): string[] {
  const normalized = `${proof} ${location || ""}`.toLowerCase();
  const tags = new Set<string>(["SGTikTok"]);
  if (/coffee|latte|cafe|kopi|tea|drink/.test(normalized)) tags.add("SGCafe");
  if (/food|dish|menu|restaurant|dining|noodle|rice|chicken|fish|spicy/.test(normalized)) tags.add("SGFood");
  if (/fitness|pilates|yoga|class|workout/.test(normalized)) tags.add("SGFitness");
  if (/beauty|spa|nail|salon|wellness/.test(normalized)) tags.add("SGWellness");
  if (location) tags.add(location.replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "Singapore");
  tags.add(brandName.replace(/[^a-z0-9]+/gi, "").slice(0, 24) || "LocalBusiness");
  return Array.from(tags).slice(0, 5);
}

function fallbackChineseTheme(primary?: string, secondary?: string): string {
  const text = [primary, secondary].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text || "新的本地服务与体验";
}

function stripDisallowedFallbackText(platformLower: string, caption: string): string {
  let cleaned = caption
    .replace(/【⚠️[\s\S]*?】\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (platformLower !== "xiaohongshu" && platformLower !== "red" && platformLower !== "xhs") {
    cleaned = cleaned.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu, "").replace(/[ \t]{2,}/g, " ");
  }
  if (platformLower === "google_business" || platformLower === "google" || platformLower === "google_maps") {
    cleaned = cleaned.replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "the Google Business call button");
  }
  return cleaned.trim();
}

function normalizeFallbackHashtags(platformLower: string, hashtags: string[]): string[] {
  if (platformLower === "google_business" || platformLower === "google" || platformLower === "google_maps") {
    return [];
  }
  const max = platformLower === "facebook" || platformLower === "fb" ? 3 : 5;
  const seen = new Set<string>();
  return hashtags
    .map((tag) => String(tag).replace(/^#+/, "").replace(/\s+/g, "").trim())
    .filter(Boolean)
    .filter((tag) => {
      if (platformLower !== "xiaohongshu" && platformLower !== "red" && platformLower !== "xhs" && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(tag)) {
        return false;
      }
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}
