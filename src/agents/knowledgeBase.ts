/**
 * AMC AI Platform Copywriting Knowledge Base
 * Contains templates, content creation ideas, video scripts, and specialized prompts.
 */

export interface KnowledgeEntry {
  ideas: string[];
  templates: string[];
  videoScripts: string[];
  prompts: string[];
}

const KNOWLEDGE_REPO: Record<string, KnowledgeEntry> = {
  fb: {
    ideas: [
      "【美食探店/打卡向】以第一人称带入，描述菜品口感细节（爆浆、拉丝、外焦里嫩等），引发食欲。",
      "【老板真心话/幕后向】讲述食材挑选的苛刻标准、熬制高汤的漫长小时数，展现匠心工艺与诚信。",
      "【本地热梗/打折向】融入新加坡 Singlish（如 'Chope', 'Don't say bojio', 'Makan time'），制造亲切感与紧急性。",
      "【社交聚会推荐】主打周末聚餐、家庭聚会场景，强调分量足、氛围感强，拉动多人订位。"
    ],
    templates: [
      "【小红书风格】🇸🇬本地人私藏的宝藏餐厅！今天打卡 [BrandName]，招牌 [Signature] 真的太惊艳了！口感 [Texture]，每一口都是幸福感，分量超级足，老板特别热情！快艾特你的小伙伴一起来吃！Let's makan!",
      "【Instagram风格】Don't say bojio! 🥩 Chope your seats now at [BrandName]! We are serving up the most tender and juicy dishes. Specially crafted for local foodies who love that authentic taste! 别说我们没约你，动作要快！🔥",
      "【Google Business风格】Looking for the best dining spot in town? [BrandName] is open daily serving up fresh, high-quality local delicacies. Check out our menu and reviews. Visit us today!"
    ],
    videoScripts: [
      "【3秒黄金钩子视频脚本】\n0-3秒: 画面特写热腾腾、拉丝/流沙的菜品瞬间。台词: '在新加坡，没吃过这家你真的亏大了！'\n3-10秒: 厨师制作过程特写（如颠勺、淋酱汁）。台词: '老板每天坚持用新鲜食材，熬制整整8小时...'\n10-15秒: 顾客大口咬下、满足微笑的镜头。台词: '口感绝了！价格还特别亲民。'\n15-20秒: 门面与地址。台词: '就在 Geylang Serai 市场！赶紧冲，不要说我 bojio！'",
      "【主厨推荐视频脚本】\n0-3秒: 主厨自信微笑面对镜头，手托招牌菜。台词: '这是我们卖了十年的招牌，今天公开秘诀！'\n3-12秒: 关键调料/工艺展示。台词: '关键就在于这道秘制酱汁，是用二十种香料慢火熬制的。'\n12-15秒: 诱人的装盘特写加收尾 CTA 引导预定。"
    ],
    prompts: [
      "使用美食博主的语气，语言生动、感官细节丰富（如酥脆、香气铺鼻、爆汁）。",
      "适当夹杂中英双语或 Singlish 俗语以贴合新加坡/马来西亚本地社媒文化。",
      "在文案结尾附带定位（📍地址）和预约方式，并使用具有吸引力的行动呼吁（CTA）。"
    ]
  },
  fitness: {
    ideas: [
      "【科普辟谣向】针对普拉提/健身常见误区（如‘练普拉提会不会粗腿’）进行专业解答，建立权威信任。",
      "【体态改善/干货向】聚焦现代人久坐痛点（圆肩驼背、腰酸），分享3个拉伸/对齐核心的小技巧。",
      "【自律打卡激励】分享学员的前后对比（Before/After）或者教练的自律日常，传递积极健康的能量。",
      "【课程体验向】描述普拉提大器械（Reformer）的新奇好玩与核心酸爽感，降低新手入门心理门槛。"
    ],
    templates: [
      "【小红书风格】🇸🇬宝藏普拉提工作室打卡！今天来 [BrandName] 体验了他们的 Reformer 核心课程。教练真的超级温柔且专业，每个动作都会亲自帮我纠正对齐，环境很干净清爽！姐妹们，让我们一起瘦出马甲线！Let's stretch!",
      "【Instagram风格】Don't say bojio! 🧘‍♀️ Chope your Reformer slots now at [BrandName]! Specially crafted for core strengthening, posture correction, and body alignment. 赶紧来霸位体验招牌普拉提核心课程，动作超标准，身体感觉轻盈了许多！✨",
      "【Google Business风格】Looking for a certified Pilates and fitness studio? [BrandName] offers expert coaching, state-of-the-art Reformer equipment, and personalized training plans. Book your session today!"
    ],
    videoScripts: [
      "【体态纠正视频脚本】\n0-3秒: 演示普通人久坐驼背的糟糕体态，红叉标记。台词: '上班族久坐，越坐越驼背？这3个动作救救你！'\n3-12秒: 教练在核心床（Reformer）上演示3个标准的拉伸伸展动作。台词: '动作一，猫式伸展，注意配合呼吸；动作二...'\n12-17秒: 演示拉伸后挺拔的直角肩/背部。台词: '每天坚持，轻松改善圆肩驼背。'\n17-20秒: 工作室全景。台词: '来 [BrandName]，专业教练手把手带你变美！'"
    ],
    prompts: [
      "使用专业而亲切的私人教练语气，讲解要有科学依据，同时通俗易懂。",
      "强调身体的健康改变、肌肉对齐（Alignment）、核心力量以及身心平衡。",
      "适合使用轻快、活力的表情符号，在文案中列出体验课福利或新人折扣。"
    ]
  },
  renovation: {
    ideas: [
      "【避坑指南向】分享厨房装修、全屋定制或白钢制品挑选时的3个常见深水坑，体现专业度。",
      "【改造案例展示】用文字描述老屋改造、厨房翻新的惊艳过程，强调前后对比（Before/After）带来的爽感。",
      "【材质科普向】通俗讲解不锈钢（如304/316区别）、全屋板材等选料讲究，说明高品质工程的原因。",
      "【商家日常/工厂实拍】展示白钢焊接、定制木工排版的真实车间镜头，展现源头工厂的硬实力与好工艺。"
    ],
    templates: [
      "【小红书风格】🇸🇬高颜值厨房不锈钢全屋定制案例！今天安利 [BrandName]，他们家做工真的太扎实了！不锈钢柜体细节处理得严丝合缝，防潮防霉效果绝了，老板特别专业！有装修需求的小伙伴赶紧收藏起来！冲呀！",
      "【Instagram风格】Looking for premium home renovations? Chope your consultation now at [BrandName]! We deliver top-tier custom stainless steel fabrication and interior renovations. Specially crafted for homeowners who value durability and elegant designs! 🇸🇬 赶紧联系预定您的专属咨询！🔥",
      "【Google Business风格】[BrandName] provides high-quality home renovations and custom stainless steel fabrication services in Singapore. Experienced craftspeople, durable materials, and tailored designs. Contact us today for a free quote!"
    ],
    videoScripts: [
      "【老房改造视频脚本】\n0-3秒: 破旧不堪的老厨房/老屋镜头。台词: '二十年的老厨房，防潮差还发霉？看我们怎么逆袭！'\n3-12秒: 装修拆卸、不锈钢柜体搬运入场、精密焊接特写。台词: '我们选用食品级304不锈钢，一体成型，永不发霉变形...'\n12-17秒: 翻新后极简现代风格的新厨房全景，灯光亮起。台词: '铛铛！高颜值不锈钢厨房大功告成！超强收纳，极其好打理！'\n17-20秒: 工厂实拍与微信二维码/电话。台词: '源头工厂直营，预约免费测量！'"
    ],
    prompts: [
      "使用经验丰富的工长或专业设计师语气，踏实可靠、注重细节、注重实用性。",
      "多使用防潮防霉、经久耐用、食品级不锈钢、严丝合缝等体现质量的词汇。",
      "在结尾清晰指引如何获取报价（提供户型图、预约上门测量等）。"
    ]
  },
  winery: {
    ideas: [
      "【佐餐搭配向】分享红酒、白葡萄酒与不同美食（海鲜、牛排甚至中餐川菜）的绝妙佐餐指南。",
      "【品酒入门科普】用最简单的话语描述酸度、单宁、酒体等基础品酒词汇，让新手无压力看懂。",
      "【酒庄幕后故事】讲述葡萄采摘季节、橡木桶陈酿年份的独特故事，提升品牌的艺术感与历史厚重度。",
      "【节日送礼/微醺场景】描写周末微醺、浪漫约会、商务宴请、节日送礼的氛围感，拉动消费欲。"
    ],
    templates: [
      "【小红书风格】🇸🇬周末微醺指南！今天推荐 [BrandName] 的招牌 [Signature]！入口是浓郁 of 果香，伴随着细腻的单宁，回甘温润持久。环境真的非常雅致，特别适合浪漫约会或者闺蜜小酌！🍷 别说不告诉你，赶紧冲！",
      "【Instagram风格】Unwind after a busy week with [BrandName]'s selection of premium wines. Specially curated for wine connoisseurs who appreciate the art of fermentation. Enjoy a glass of elegance. 🍷✨ Chope your table or order online today!",
      "【Google Business风格】Discover premium wines and beverages at [BrandName]. We source directly from top global vineyards to ensure authenticity and quality. Visit us for wine tastings or shop online."
    ],
    videoScripts: [
      "【微醺氛围视频脚本】\n0-3秒: 高脚杯中红酒倾泻倒入、酒液旋转特写，背景音乐柔和轻缓。台词: '忙碌了一周，今晚需要一点微醺的仪式感。'\n3-12秒: 瓶塞拔出声音、红酒与芝士盘对齐、精致烛光镜头。台词: '这款红酒在法国橡木桶中陈酿了十八个月，单宁丝滑...'\n12-17秒: 朋友碰杯、开怀大笑的温暖瞬间。台词: '最好的酒，就是要和最爱的人一起分享。'\n17-20秒: 在线商城截图或实体店门面。台词: '点击下方链接，把这份微醺美味带回家。'"
    ],
    prompts: [
      "使用有格调、优雅且懂享受生活的品酒专家口吻，文字要有画面感和氛围感。",
      "突出果香浓郁、单宁丝滑、酒体平衡、橡木桶陈酿等体现专业的词汇。",
      "配合使用微醺、浪漫、精致、聚会等场景词，引导线上订购或到店品鉴。"
    ]
  },
  general: {
    ideas: [
      "【品牌计划】整理品牌初心、定位主张、内容沟通方向和长期运营记忆。",
      "【日常问候/互动向】结合今日天气、周末心情、假期安排，向粉丝进行温馨互动，提高粘性。",
      "【客户故事/好评反馈】分享一个真实客户满意的反馈故事，展示品牌的高品质服务口碑。"
    ],
    templates: [
      "【小红书风格】🇸🇬本地人都在冲的宝藏品牌 [BrandName]！今天必须要夸夸他们家，细节真的做得太到位了，真心推荐！大家一定要来体验一次！✨",
      "【Instagram风格】Welcome to [BrandName]! We are committed to providing you with the highest quality products and services. Specially designed for those who seek excellence. Chope yours today! 🇸🇬",
      "【Google Business风格】Welcome to [BrandName]! We provide high-quality services and premium products in Singapore. Contact us today or visit our store to learn more!"
    ],
    videoScripts: [
      "【品牌介绍视频脚本】\n0-3秒: 精美大气的品牌Logo与标语。台词: '用心做好每一件事，这是我们的承诺。'\n3-12秒: 员工工作、认真服务顾客的真实镜头。台词: '从每一个小细节出发，我们不断追求卓越...'\n12-17秒: 满意的顾客合影或产品陈列。台词: '因为你们的满意，就是我们前进的最大动力。'\n17-20秒: 官方网址与联系电话。台词: '立即关注我们，解锁更多精彩！'"
    ],
    prompts: [
      "保持中正、积极、专业的品牌主理人语气，友好且诚恳。",
      "重点强调品牌信誉、专业技能、客户至上的服务理念。",
      "指引客户点击链接了解详情或拨打电话进行咨询。"
    ]
  }
};

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CUSTOM_TEMPLATES_PATH = join(process.cwd(), 'src/agents/customTemplates.json');

export interface CustomTemplateEntry {
  industry: string; // e.g. 'fb', 'fitness', 'renovation', 'winery', 'general'
  platform: string; // e.g. 'instagram', 'red', 'tiktok', 'facebook', 'google_business', 'all'
  template?: string;
  idea?: string;
  videoScript?: string;
  prompt?: string;
}

export function getCustomTemplates(): CustomTemplateEntry[] {
  try {
    if (existsSync(CUSTOM_TEMPLATES_PATH)) {
      const content = readFileSync(CUSTOM_TEMPLATES_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Failed to read custom templates:', err);
  }
  return [];
}

export function addCustomTemplate(entry: CustomTemplateEntry): boolean {
  try {
    const templates = getCustomTemplates();
    templates.push(entry);
    writeFileSync(CUSTOM_TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write custom templates:', err);
    return false;
  }
}

/**
 * Resolves the knowledge entry key based on the detected industry string.
 */
function resolveIndustryKey(industry: string): string {
  const ind = industry.toLowerCase();
  if (ind.includes('food') || ind.includes('restaurant') || ind.includes('dining') || ind.includes('catering') || ind.includes('cai fan') || ind.includes('餐')) {
    return 'fb';
  }
  if (ind.includes('pilates') || ind.includes('fitness') || ind.includes('yoga') || ind.includes('gym') || ind.includes('健身') || ind.includes('动')) {
    return 'fitness';
  }
  if (ind.includes('renovation') || ind.includes('steel') || ind.includes('interior') || ind.includes('wood') || ind.includes('装') || ind.includes('设计')) {
    return 'renovation';
  }
  if (ind.includes('winery') || ind.includes('wine') || ind.includes('beverage') || ind.includes('酒')) {
    return 'winery';
  }
  return 'general';
}

/**
 * Returns matching knowledge base entries based on the brand's industry,
 * target platform, and task details.
 */
export function getRelevantKnowledge(industry: string, platform: string, queryText: string = ''): KnowledgeEntry {
  const key = resolveIndustryKey(industry);
  const repoEntry = {
    ideas: [...(KNOWLEDGE_REPO[key]?.ideas || KNOWLEDGE_REPO.general.ideas)],
    templates: [...(KNOWLEDGE_REPO[key]?.templates || KNOWLEDGE_REPO.general.templates)],
    videoScripts: [...(KNOWLEDGE_REPO[key]?.videoScripts || KNOWLEDGE_REPO.general.videoScripts)],
    prompts: [...(KNOWLEDGE_REPO[key]?.prompts || KNOWLEDGE_REPO.general.prompts)],
  };
  
  // Merge custom templates from the JSON file
  try {
    const customEntries = getCustomTemplates();
    const resolvedKey = resolveIndustryKey(industry);
    for (const entry of customEntries) {
      if (resolveIndustryKey(entry.industry) === resolvedKey) {
        if (entry.idea) repoEntry.ideas.push(entry.idea);
        if (entry.videoScript) repoEntry.videoScripts.push(entry.videoScript);
        if (entry.prompt) repoEntry.prompts.push(entry.prompt);
        if (entry.template) {
          const entryPlat = entry.platform.toLowerCase();
          const targetPlat = platform.toLowerCase();
          if (entryPlat === 'all' || entryPlat.includes(targetPlat) || targetPlat.includes(entryPlat)) {
            repoEntry.templates.push(entry.template);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load custom templates in getRelevantKnowledge:', err);
  }

  // We can filter templates by target platform for better relevance
  const normalizedPlat = platform.toLowerCase();
  let matchedTemplates = repoEntry.templates;
  if (normalizedPlat.includes('red') || normalizedPlat.includes('xiaohongshu')) {
    matchedTemplates = repoEntry.templates.filter(t => t.includes('小红书') || (!t.includes('Instagram') && !t.includes('Facebook') && !t.includes('Google')));
  } else if (normalizedPlat.includes('instagram')) {
    matchedTemplates = repoEntry.templates.filter(t => t.includes('Instagram') || (!t.includes('小红书') && !t.includes('Facebook') && !t.includes('Google')));
  } else if (normalizedPlat.includes('facebook')) {
    matchedTemplates = repoEntry.templates.filter(t => t.includes('Facebook') || t.includes('Instagram') || (!t.includes('小红书') && !t.includes('Google')));
  } else if (normalizedPlat.includes('google')) {
    matchedTemplates = repoEntry.templates.filter(t => t.includes('Google') || (!t.includes('小红书') && !t.includes('Instagram') && !t.includes('Facebook')));
  }
  
  // If no platform specific template matched, fallback to all templates for that industry
  if (matchedTemplates.length === 0) {
    matchedTemplates = repoEntry.templates;
  }

  let finalIdeas = repoEntry.ideas;
  let finalPrompts = repoEntry.prompts;

  if (queryText && queryText.trim()) {
    matchedTemplates = [...matchedTemplates].sort((a, b) => getJaccardSimilarity(b, queryText) - getJaccardSimilarity(a, queryText));
    finalIdeas = [...finalIdeas].sort((a, b) => getJaccardSimilarity(b, queryText) - getJaccardSimilarity(a, queryText));
    finalPrompts = [...finalPrompts].sort((a, b) => getJaccardSimilarity(b, queryText) - getJaccardSimilarity(a, queryText));
  }

  return {
    ideas: finalIdeas,
    templates: matchedTemplates,
    videoScripts: repoEntry.videoScripts,
    prompts: finalPrompts
  };
}

export function getJaccardSimilarity(str1: string, str2: string): number {
  const tokenize = (s: string) => {
    const clean = (s || '').toLowerCase().trim()
    const parts = clean.split(/\s+/)
    const tokens: string[] = []
    for (const part of parts) {
      if (/[\u4e00-\u9fa5]/.test(part)) {
        tokens.push(...part.split(''))
      } else if (part) {
        tokens.push(part)
      }
    }
    return tokens
  }

  const tokens1 = tokenize(str1)
  const tokens2 = tokenize(str2)
  if (tokens1.length === 0 || tokens2.length === 0) return 0
  const s1 = new Set(tokens1)
  const s2 = new Set(tokens2)
  const intersection = new Set([...s1].filter(x => s2.has(x)))
  const union = new Set([...s1, ...s2])
  return intersection.size / union.size
}
