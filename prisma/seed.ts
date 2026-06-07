import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding AI Marketing Crew database...')

  // ── Clean slate ────────────────────────────────────────────────────────────
  await prisma.conversionEvent.deleteMany()
  await prisma.contentAssetRef.deleteMany()
  await prisma.actionItem.deleteMany()
  await prisma.contentDraft.deleteMany()
  await prisma.mediaAsset.deleteMany()
  await prisma.socialAccount.deleteMany()
  await prisma.brand.deleteMany()
  await prisma.agentPermission.deleteMany()
  await prisma.workUnit.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.user.deleteMany()

  // ── Users ─────────────────────────────────────────────────────────────────
  const hashedPw = await bcrypt.hash('password123', 10)

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: hashedPw,
      type: 'HUMAN',
      role: 'ADMIN',
      nickname: '管理员',
    },
  })

  const owner = await prisma.user.create({
    data: {
      email: 'boss@yushanfang.com',
      password: hashedPw,
      type: 'HUMAN',
      role: 'USER',
      nickname: '老板',
    },
  })

  const agent = await prisma.user.create({
    data: {
      email: 'agent-amc@openclaw.ai',
      password: hashedPw,
      type: 'AI_AGENT',
      role: 'USER',
      nickname: 'AMC Marketing Agent',
      apiKey: 'amc-agent-dev-key-001',
      introduction: '专注于餐饮品牌社媒运营的 AI 员工',
      workflow: '监控差评 → 生成内容 → 提交审批 → 发布',
      themeColor: '#10b981',
    },
  })

  console.log('✅ Users created:', admin.email, owner.email, agent.email)

  // ── Brands ─────────────────────────────────────────────────────────────────
  const brandA = await prisma.brand.create({
    data: {
      ownerId: owner.id,
      name: '御膳房',
      location: 'New York',
      timezone: 'America/New_York',
      autoPilot: true,
    },
  })

  const brandB = await prisma.brand.create({
    data: {
      ownerId: owner.id,
      name: 'Golden Dragon',
      location: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      autoPilot: true,
    },
  })

  console.log('✅ Brands created:', brandA.name, brandB.name)

  // ── Social Accounts ────────────────────────────────────────────────────────
  const [ig, xhs, google] = await Promise.all([
    prisma.socialAccount.create({
      data: {
        brandId: brandA.id,
        platformId: 'instagram',
        handle: '@yushanfang_nyc',
        displayName: '御膳房 NYC',
        followerCount: 1240,
        followerDelta: 12,
        snapshotAt: new Date(),
        autoPilot: true,
      },
    }),
    prisma.socialAccount.create({
      data: {
        brandId: brandA.id,
        platformId: 'xiaohongshu',
        handle: '@御膳房 NYC',
        displayName: '御膳房 NYC 小红书',
        followerCount: 840,
        followerDelta: 5,
        snapshotAt: new Date(),
        autoPilot: true,
      },
    }),
    prisma.socialAccount.create({
      data: {
        brandId: brandA.id,
        platformId: 'google',
        handle: 'Yu Shan Fang Restaurant',
        displayName: 'Google Business',
        ratingScore: 4.8,
        snapshotAt: new Date(),
        autoPilot: true,
      },
    }),
    prisma.socialAccount.create({
      data: {
        brandId: brandA.id,
        platformId: 'tiktok',
        handle: '@yushanfang',
        displayName: '御膳房 TikTok',
        followerCount: 320,
        followerDelta: 28,
        snapshotAt: new Date(),
        autoPilot: true,
      },
    }),
  ])

  console.log('✅ Social accounts created: IG, XHS, Google, TikTok')

  // ── Content Drafts ─────────────────────────────────────────────────────────
  const draft1 = await prisma.contentDraft.create({
    data: {
      brandId: brandA.id,
      accountId: ig.id,
      caption: "🌸 Mother's Day Special! Bring mom to 御膳房 for an unforgettable dining experience. Our signature Boston Lobster Set is perfect for celebrating the most important person in your life. Book now and receive a complimentary dessert! 🦞❤️\n\n#MothersDay #NYCDining #ChineseFood #BostonLobster #御膳房",
      captionLang: 'en',
      hashtags: ['MothersDay', 'NYCDining', 'ChineseFood', 'BostonLobster'],
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      status: 'pending_review',
      agentId: agent.id,
      agentNote: '母亲节提前两天发布，配合节日热度。已根据 IG 算法优化 hashtag 数量，建议配合本地节日热搜标签。',
    },
  })

  const draft2 = await prisma.contentDraft.create({
    data: {
      brandId: brandA.id,
      accountId: xhs.id,
      caption: '🦞 波士顿大龙虾新品上线！\n\n老板今天亲自从市场精选的超新鲜大龙虾 🔥\n\n✨ 现杀现做，鲜甜弹牙\n✨ 主厨秘制酱汁，入口即化\n✨ 分量超足，性价比拉满！\n\n📍 地址：纽约曼哈顿\n📞 订位：(212) xxx-xxxx\n\n#纽约美食 #中餐厅 #波士顿龙虾 #御膳房 #纽约探店',
      captionLang: 'zh',
      hashtags: ['纽约美食', '中餐厅', '波士顿龙虾', '御膳房', '纽约探店'],
      scheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6h from now (7pm)
      status: 'pending_review',
      agentId: agent.id,
      agentNote: '根据老板上午发来的龙虾原图制作。已完成 AI 精修，建议今晚 7 点发布，流量峰值时段。',
    },
  })

  console.log('✅ Content drafts created')

  // ── Action Items ───────────────────────────────────────────────────────────
  await prisma.actionItem.create({
    data: {
      brandId: brandA.id,
      accountId: google.id,
      type: 'sentiment_alert',
      priority: 'urgent',
      title: '收到【2星差评】需立即回复',
      description: '"等位时间太长，服务员也不理人。" ——AI 已生成 3 套极具同理心的安抚话术，并附带专属致歉折扣码，点击即可一键发送。',
      payload: {
        rating: 2,
        reviewerName: 'John D.',
        reviewText: 'Wait time was way too long and the staff ignored us. Food was okay but the service ruined the experience.',
        reviewUrl: 'https://maps.google.com/mock-review-url',
        suggestedReplies: [
          "Dear John, we sincerely apologize for your disappointing experience. Long wait times and inattentive service are absolutely not the standard we hold ourselves to. We'd love to make it right — please reach out to us directly at [email] and we'll ensure your next visit is exceptional. As a token of our apology, please enjoy 20% off your next meal with code SORRY20. — The Yu Shan Fang Team",
          "Hi John, thank you for taking the time to share your feedback. We're truly sorry the service fell short of your expectations that evening. Your experience has been shared with our management team and we're addressing this immediately with our staff. We'd love the chance to restore your faith in us — please accept a complimentary appetizer on your next visit. — Yu Shan Fang",
          "John, we hear you and we're sorry. A 2-star experience is not what we want for any guest. We've spoken with the team about that evening and are committed to doing better. Please DM us so we can personally arrange a redemption dinner for you. Thank you for helping us improve. — Yu Shan Fang Management",
        ],
      },
      status: 'pending',
      agentId: agent.id,
    },
  })

  await prisma.actionItem.create({
    data: {
      brandId: brandA.id,
      accountId: ig.id,
      type: 'content_approval',
      priority: 'high',
      title: '母亲节预热海报等待审核',
      description: '【预览图已生成】文案：庆祝母亲节！带妈妈来享用双人龙虾套餐，今日预定即赠限定甜点。AI 已适配中英双语，点击右滑即可发布。',
      payload: {
        draftId: draft1.id,
        previewCaption: "🌸 Mother's Day Special...",
        platform: 'instagram',
        scheduledAt: draft1.scheduledAt,
      },
      status: 'pending',
      agentId: agent.id,
      draftId: draft1.id,
    },
  })

  await prisma.actionItem.create({
    data: {
      brandId: brandA.id,
      accountId: xhs.id,
      type: 'content_approval',
      priority: 'normal',
      title: '本周日常: 新品波士顿大龙虾',
      description: '老板上午投喂的龙虾图片已完成 AI 精修 + 打标。文案已生成，配图已优化。建议今晚 7 点发布，流量峰值时段。',
      payload: {
        draftId: draft2.id,
        platform: 'xiaohongshu',
        scheduledAt: draft2.scheduledAt,
      },
      status: 'pending',
      agentId: agent.id,
      draftId: draft2.id,
    },
  })

  console.log('✅ Action items created (1 sentiment_alert + 2 content_approval)')

  // ── Conversion Events (sample history) ────────────────────────────────────
  const now = new Date()
  await prisma.conversionEvent.createMany({
    data: [
      { brandId: brandA.id, type: 'nav_click',     source: 'instagram',   occurredAt: new Date(now.getTime() - 1 * 86400000) },
      { brandId: brandA.id, type: 'nav_click',     source: 'instagram',   occurredAt: new Date(now.getTime() - 2 * 86400000) },
      { brandId: brandA.id, type: 'booking_click', source: 'xiaohongshu', occurredAt: new Date(now.getTime() - 1 * 86400000) },
      { brandId: brandA.id, type: 'booking_click', source: 'google',      occurredAt: new Date(now.getTime() - 3 * 86400000) },
      { brandId: brandA.id, type: 'coupon_redemption', source: 'instagram', couponCode: 'AMC2024', occurredAt: new Date(now.getTime() - 2 * 86400000) },
      { brandId: brandA.id, type: 'coupon_redemption', source: 'xiaohongshu', couponCode: 'AMC2024', occurredAt: new Date(now.getTime() - 1 * 86400000) },
    ],
  })

  console.log('✅ Conversion events seeded')
  console.log('\n🎉 Seed complete!')
  console.log('  Login: boss@yushanfang.com / password123')
  console.log('  Admin: admin@example.com / password123')
  console.log('  Agent API key: amc-agent-dev-key-001')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
