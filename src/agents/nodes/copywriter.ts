import { prisma } from "../../lib/prisma.ts";

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

  // Generate localized Singlish/bilingual copy
  let caption = "";
  let hashtags: string[] = [];

  const brandName = brand.name;
  const signature = brand.description || "delicious foods";
  const taskTitle = task.title;

  // Let's create a premium-looking double-language Singlish/Chinese/English copy
  if (platform === "instagram" || platform === "tiktok") {
    caption = `Don't say bojio! 🥩 Chope your seats now at ${brandName}!
    
We are serving up the most tender and juicy dishes. Specially crafted for local foodies who love that authentic taste! 🇸🇬

别说我们没约你！赶紧来 ${brandName} 霸位体验我们家招牌特色菜！超级入味，绝对满足你挑剔的味蕾！🔥`;
    hashtags = ["sgfood", "sgfoodie", "instafood", brandName.replace(/\s+/g, "").toLowerCase(), "singaporeeat"];
  } else if (platform === "red") { // 小红书
    caption = `🇸🇬 新加坡本地人排队都要吃的爆款美食！

今天打卡 ${brandName}，他们家真的太出圈了！
✨ 招牌推荐：${signature.substring(0, 50)}...
口感真的绝了，分量超级足，老板还特别热情！

快艾特你的小伙伴一起来吃！makan time!`;
    hashtags = ["新加坡美食", "新加坡生活", brandName.replace(/\s+/g, ""), "新加坡探店", "新加坡吃喝玩乐"];
  } else if (platform === "google_business") {
    caption = `Looking for the best dining spot in town? Look no further!

${brandName} is open daily serving up fresh, high-quality local delicacies. Check out our menu and reviews. Visit us today!`;
    hashtags = [brandName.replace(/\s+/g, "").toLowerCase(), "googlemaps", "sgrestaurants"];
  } else {
    caption = `Welcome to ${brandName}! Enjoy our best ${signature}. We wait for you!`;
    hashtags = [brandName.replace(/\s+/g, "").toLowerCase()];
  }

  // If task title suggests something specific, inject it
  if (taskTitle.toLowerCase().includes("burgers") || taskTitle.toLowerCase().includes("汉堡")) {
    caption = caption.replace("dishes", "Wagyu Burgers").replace("特色菜", "多汁和牛堡");
  } else if (taskTitle.toLowerCase().includes("steak") || taskTitle.toLowerCase().includes("牛排")) {
    caption = caption.replace("dishes", "Ribeye Steaks").replace("特色菜", "炭烤沙朗牛排");
  } else if (taskTitle.toLowerCase().includes("coffee") || taskTitle.toLowerCase().includes("咖啡")) {
    caption = caption.replace("dishes", "Nanyang Kopi").replace("特色菜", "南洋传统咖啡");
  } else if (taskTitle.toLowerCase().includes("pork") || taskTitle.toLowerCase().includes("猪肉")) {
    const hasPorkViolation = state.complianceReason && state.complianceReason.toLowerCase().includes("pork");
    if (hasPorkViolation) {
      console.log("Copywriter: Pork violation detected in history. Generating Halal mock-meat alternative.");
      caption = caption.replace("dishes", "Crispy Mock Ribs (Vegetarian / Halal)").replace("特色菜", "素脆皮排骨 (清真)");
    } else {
      caption = caption.replace("dishes", "Crispy Pork Ribs").replace("特色菜", "脆皮炸猪肉");
    }
  } else if (taskTitle.toLowerCase().includes("best") || taskTitle.toLowerCase().includes("第一")) {
    caption = caption.replace("dishes", "Best Foods in the World").replace("特色菜", "全岛第一招牌菜");
  }

  console.log("Copywriter generated caption preview:", caption.split("\n")[0]);

  return {
    caption,
    hashtags
  };
}
