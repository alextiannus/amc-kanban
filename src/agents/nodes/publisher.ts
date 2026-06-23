import { prisma } from "../../lib/prisma.ts";

export async function publisherNode(state: any) {
  console.log("=== PublisherNode Running ===");
  const { brandId, taskId, platform, caption, mediaUrls, hashtags } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  // 1. Check if SocialAccount exists, or create a mock one
  let socialAccount = await prisma.socialAccount.findFirst({
    where: {
      brandId,
      platformId: platform
    }
  });

  if (!socialAccount) {
    console.log(`No social account found for brand ${brandId} on ${platform}. Creating a mock account.`);
    socialAccount = await prisma.socialAccount.create({
      data: {
        brandId,
        platformId: platform,
        handle: "mock_" + platform + "_handle",
        displayName: "Mock " + platform + " Account",
        autoPilot: true
      }
    });
  }

  const cleanHashtags = hashtags || [];
  const fullCaption = `${caption}\n\n${cleanHashtags.map((h: string) => `#${h}`).join(" ")}`;
  const publishedUrl = `https://www.${platform}.com/p/amc_mock_${Date.now()}`;

  console.log(`Publishing post to ${platform} at URL: ${publishedUrl}`);

  // 2. Log in ContentDraft
  await prisma.contentDraft.create({
    data: {
      brandId,
      accountId: socialAccount.id,
      caption: fullCaption,
      mediaUrls: mediaUrls || [],
      hashtags: cleanHashtags,
      status: "published",
      platformPostId: "post_" + Date.now(),
      publishedAt: new Date()
    }
  });

  // 3. Update the Kanban WorkUnit to done
  await prisma.workUnit.update({
    where: { id: taskId },
    data: {
      status: "done",
      requiredInput: `Published successfully at: ${publishedUrl}`
    }
  });

  console.log(`WorkUnit ${taskId} successfully closed and marked as done.`);

  return {
    publishedUrl,
    status: "done"
  };
}
