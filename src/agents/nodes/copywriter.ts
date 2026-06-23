import { prisma } from "../../lib/prisma.ts";
import { postfastGetAnalytics } from "../../lib/integrations/postfast.ts";
import { generateText } from "../../lib/gemini.ts";

export async function copywriterNode(state: any) {
  console.log("=== CopywriterNode Running ===");
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
        console.log("AI Copywriter generated optimized content successfully using Gemini.");
      }
    }
  } catch (error) {
    console.error("Failed to generate or parse Gemini copywriter response:", error);
  }

  // 3. Fallback Rule-Based Generation (Runs if Gemini is not configured or fails)
  if (!geminiUsed) {
    console.log("Falling back to rule-based copywriter templates.");
    const brandName = brand.name;
    const signature = brand.description || `premium ${detectedIndustry} services`;
    const taskTitle = task.title;

    if (detectedIndustry.toLowerCase().includes('fitness') || detectedIndustry.toLowerCase().includes('pilates')) {
      if (platform === "instagram" || platform === "tiktok") {
        aiCaption = `Don't say bojio! 🧘‍♀️ Chope your slots now at ${brandName}!
    
We offer the most professional Pilates and fitness sessions. Specially crafted for health enthusiasts who love core strengthening and posture correction! 🇸🇬

别说我们没约你！赶紧来 ${brandName} 霸位体验我们家招牌普拉提核心课程！动作超标准，绝对满足你挑剔的锻炼需求！🔥`;
        aiHashtags = ["sgfitness", "sgpilates", "workout", brandName.replace(/\s+/g, "").toLowerCase(), "singaporefit"];
      } else if (platform === "red") { // 小红书
        aiCaption = `🇸🇬 新加坡本地人都在冲的宝藏普拉提工作室！
    
今天打卡 ${brandName}，他们家真的太专业了！
✨ 招牌推荐：${signature.substring(0, 50)}...
核心塑形效果真的绝了，教练超级温柔有耐心，环境十分干净舒适！
    
快艾特你的小伙伴一起来塑形锻炼！let's stretch!`;
        aiHashtags = ["新加坡普拉提", "新加坡健身", brandName.replace(/\s+/g, ""), "新加坡探店", "新加坡生活"];
      } else if (platform === "google_business") {
        aiCaption = `Looking for the best Pilates and fitness studio in town? Look no further!
    
${brandName} is open daily offering professional workouts and certified trainers. Check out our schedules and reviews. Visit us today!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase(), "googlemaps", "sgpilates"];
      } else {
        aiCaption = `Welcome to ${brandName}! Enjoy our best ${signature}. We wait for you!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase()];
      }
    } else if (detectedIndustry.toLowerCase().includes('renovation') || detectedIndustry.toLowerCase().includes('steel')) {
      if (platform === "instagram" || platform === "tiktok") {
        aiCaption = `Looking for premium home renovations? Chope your consultation now at ${brandName}!
    
We deliver top-tier custom stainless steel fabrication and interior renovations. Specially crafted for homeowners who value durability and elegant designs! 🇸🇬

想要打造完美的家居空间？赶紧联系 ${brandName} 预定您的专属咨询！精工细作，绝对让您的家居焕然一新！🔥`;
        aiHashtags = ["sgrenovation", "sginterior", "homedecor", brandName.replace(/\s+/g, "").toLowerCase(), "singaporehome"];
      } else if (platform === "red") { // 小红书
        aiCaption = `🇸🇬 新加坡本地宝藏高颜值不锈钢与全屋定制装修！
    
今天安利 ${brandName}，他们家做工真的太扎实了！
✨ 招牌推荐：${signature.substring(0, 50)}...
不锈钢厨柜效果真的绝了，质感拉满，细节处处理得严丝合缝，老板特别专业！
    
有装修需求的小伙伴赶紧收藏起来！冲呀！`;
        aiHashtags = ["新加坡装修", "新加坡室内设计", brandName.replace(/\s+/g, ""), "新加坡生活", "不锈钢厨柜"];
      } else if (platform === "google_business") {
        aiCaption = `Looking for reliable home renovation or custom steel works in Singapore? Look no further!
    
${brandName} is open daily providing premium design and fabrication services. Contact us today for a quote!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase(), "googlemaps", "sgrenovation"];
      } else {
        aiCaption = `Welcome to ${brandName}! Enjoy our best ${signature}. We wait for you!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase()];
      }
    } else {
      // F&B Default fallback
      if (platform === "instagram" || platform === "tiktok") {
        aiCaption = `Don't say bojio! 🥩 Chope your seats now at ${brandName}!
    
We are serving up the most tender and juicy dishes. Specially crafted for local foodies who love that authentic taste! 🇸🇬

别说我们没约你！赶紧来 ${brandName} 霸位体验我们家招牌特色菜！超级入味，绝对满足你挑剔的味蕾！🔥`;
        aiHashtags = ["sgfood", "sgfoodie", "instafood", brandName.replace(/\s+/g, "").toLowerCase(), "singaporeeat"];
      } else if (platform === "red") { // 小红书
        aiCaption = `🇸🇬 新加坡本地人排队都要吃的爆款美食！
    
今天打卡 ${brandName}，他们家真的太出圈了！
✨ 招牌推荐：${signature.substring(0, 50)}...
口感真的绝了，分量超级足，老板还特别热情！
    
快艾特你的小伙伴一起来吃！makan time!`;
        aiHashtags = ["新加坡美食", "新加坡生活", brandName.replace(/\s+/g, ""), "新加坡探店", "新加坡吃喝玩乐"];
      } else if (platform === "google_business") {
        aiCaption = `Looking for the best dining spot in town? Look no further!
    
${brandName} is open daily serving up fresh, high-quality local delicacies. Check out our menu and reviews. Visit us today!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase(), "googlemaps", "sgrestaurants"];
      } else {
        aiCaption = `Welcome to ${brandName}! Enjoy our best ${signature}. We wait for you!`;
        aiHashtags = [brandName.replace(/\s+/g, "").toLowerCase()];
      }
    }

    // Adapt based on task title keywords
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
