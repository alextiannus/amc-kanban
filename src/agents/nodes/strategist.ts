import { prisma } from "../../lib/prisma.ts";
import { getRelevantKnowledge } from "../knowledgeBase.ts";

export async function strategistNode(state: any) {
  console.log("=== StrategistNode Running ===");
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

  // 1. Resolve brand industry
  const decision = await prisma.assignmentDecisionLog.findFirst({
    where: { subjectId: brand.id },
    orderBy: { createdAt: 'desc' }
  });

  const nameLower = brand.name.toLowerCase();
  const descLower = (brand.description || '').toLowerCase();
  let detectedIndustry = decision?.requestedIndustry || 'General';

  if (detectedIndustry === 'General' || !detectedIndustry) {
    if (nameLower.includes('pilates') || nameLower.includes('普拉提') || descLower.includes('pilates') || descLower.includes('fitness') || descLower.includes('yoga')) {
      detectedIndustry = 'Pilates/Fitness';
    } else if (nameLower.includes('装修') || nameLower.includes('白钢') || nameLower.includes('renovation') || descLower.includes('renovation') || descLower.includes('interior')) {
      detectedIndustry = 'Home Renovation/Steel Work';
    } else if (nameLower.includes('winery') || nameLower.includes('酒') || descLower.includes('winery') || descLower.includes('wine')) {
      detectedIndustry = 'Winery/Beverages';
    } else if (nameLower.includes('seafood') || nameLower.includes('海鲜') || nameLower.includes('烤鱼') || nameLower.includes('restaurant') || nameLower.includes('饭') || nameLower.includes('菜') || descLower.includes('food') || descLower.includes('restaurant') || descLower.includes('dining')) {
      detectedIndustry = 'Food & Beverage';
    }
  }

  console.log(`Strategist resolved Industry: ${detectedIndustry} for platform ${platform}`);

  // 2. Query Knowledge Base rules & templates
  const knowledge = getRelevantKnowledge(detectedIndustry, platform || "instagram", task.title + " " + (task.description || ""));

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
  `.trim();

  // 3. Compile platform-specific styling guidelines
  let platformSpecificPrompt = "";
  const normalizedPlat = (platform || "").toLowerCase();

  if (normalizedPlat === "red" || normalizedPlat === "xiaohongshu") {
    platformSpecificPrompt = `
[小红书 (Xiaohongshu/RED) 创作规范]:
- 语气: 活泼、富有亲和力，多采用闺蜜式安利、干货种草的口吻（如使用“姐妹们”、“家人们”、“亲测有用”等）。
- 标题: 必须包含一个极其吸引眼球的标题（放置于最开头，使用 Emoji 环绕，如“🔥爆赞！本地人才知道的宝藏普拉提店！”）。
- 排版: 必须使用大量 Emoji 符号进行排版，多用空行和列表形式，保持内容通俗易懂、视觉活跃。
- 标签: 结尾附带 5-10 个小红书高频标签（如 #我的运动日常 #新加坡生活 #种草）。
    `;
  } else if (normalizedPlat === "instagram") {
    platformSpecificPrompt = `
[Instagram 创作规范]:
- 语气: 简洁、有格调、现代化。根据品牌调性（如健身、酒庄）保持高级与活力，适度口语化。
- 本地化: 可以穿插适量的本地特色英文/双语（如新加坡的 "bojio"、"chope"）来增添本土色彩。
- 排版: 简练、重点突出，段落间合理空行。
- 标签: 结尾附带 5-15 个高度相关的标签，使排版清爽。
    `;
  } else if (normalizedPlat === "facebook") {
    platformSpecificPrompt = `
[Facebook 创作规范]:
- 语气: 亲切友好且专业。适合家庭、社区或较长信息的讲述，建立信任感。
- 排版: 清晰的段落结构，将重要活动/亮点列为列表。可直接附带链接。
- 标签: 附带 3-5 个品牌核心标签，避免使用过多标签导致版面杂乱。
    `;
  } else if (normalizedPlat === "google_business" || normalizedPlat === "google") {
    platformSpecificPrompt = `
[Google Business Profile 创作规范]:
- 语气: 极其专业、严谨、商业化。专注于介绍产品、服务亮点、地址或特定优惠活动。
- 标签: ⚠️绝对不能使用任何 Hashtags (#)，因为 Hashtags 在 GoogleGBP 上没有实际功能且影响专业度。
- CTA: 结尾附带明确的行动指引（如 "Visit us today", "Contact our team for a free quote"）。
    `;
  } else if (normalizedPlat === "tiktok") {
    platformSpecificPrompt = `
[TikTok 创作规范]:
- 语气: 充满激情、幽默或极具视觉吸引力。
- 结构: 必须包含前 3 秒黄金钩子视频脚本（在 JSON 的 caption 前部或单独的指导文案中提示视频画面与旁白同步），Caption 文本本身要极其简短（控制在 150 字以内），重点是引导观众观看视频或留下评论。
- 标签: 包含 3-5 个广泛的趋势标签和品牌标签。
    `;
  }

  const marketingStrategy = `
[Target Industry]: ${detectedIndustry}

[Predefined Platform Guidelines]:
${platformSpecificPrompt}

[Knowledge Base Templates]:
${knowledgeText}
  `.trim();

  console.log(`Strategist compiled brand strategy rules (${marketingStrategy.length} chars).`);

  return {
    marketingStrategy
  };
}
