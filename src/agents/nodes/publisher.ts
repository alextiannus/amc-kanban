import { prisma } from "../../lib/prisma.ts";
import { postfastPublish } from "../../lib/integrations/postfast.ts";

export async function publisherNode(state: any) {
  console.log("=== PublisherNode Running ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform, caption, mediaUrls, hashtags } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  // 1. Fetch brand details
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      name: true
    }
  });

  if (!brand) {
    throw new Error(`Brand ${brandId} not found.`);
  }

  // 2. Fetch or create a social account record for logging
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
  const fullCaption = `${caption}\n\n${cleanHashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(" ")}`;

  const isMockAccount = socialAccount.handle?.startsWith("mock_") || !brand.postfastApiKey;
  const isManualPlatform = platform === "red" || platform === "xiaohongshu";

  // 3. Execute publishing via PostFast if API Key is configured and account is connected and supports auto-publish
  if (brand.postfastApiKey && !isMockAccount && !isManualPlatform) {
    console.log(`Brand ${brand.name} has PostFast API key. Initiating actual social media publish...`);
    try {
      const publishRes = await postfastPublish({
        apiKey: brand.postfastApiKey,
        platform,
        caption,
        mediaUrls: mediaUrls || [],
        hashtags: cleanHashtags,
        accountId: socialAccount.id
      });

      if (publishRes.success) {
        const publishedUrl = publishRes.url || `https://www.${platform}.com/p/amc_mock_${Date.now()}`;
        console.log(`PostFast Publish Success! Post ID: ${publishRes.postId}, URL: ${publishedUrl}`);

        // Log the published draft
        await prisma.contentDraft.create({
          data: {
            brandId,
            accountId: socialAccount.id,
            caption: fullCaption,
            mediaUrls: mediaUrls || [],
            hashtags: cleanHashtags,
            status: "published",
            platformPostId: publishRes.postId || "post_" + Date.now(),
            publishedAt: new Date()
          }
        });

        // Update the Kanban WorkUnit to done
        await prisma.workUnit.update({
          where: { id: taskId },
          data: {
            status: "done",
            requiredInput: `Published successfully via PostFast at: ${publishedUrl}`
          }
        });

        return {
          publishedUrl,
          status: "done"
        };
      } else {
        console.error(`PostFast Publish Failed: ${publishRes.error}`);
        
        // Log draft with failed status
        await prisma.contentDraft.create({
          data: {
            brandId,
            accountId: socialAccount.id,
            caption: fullCaption,
            mediaUrls: mediaUrls || [],
            hashtags: cleanHashtags,
            status: "failed",
            agentNote: `PostFast Publish Failed: ${publishRes.error || "Unknown error"}`
          }
        });

        // Keep task pending and report error
        await prisma.workUnit.update({
          where: { id: taskId },
          data: {
            status: "pending",
            requiredInput: `Publishing failed via PostFast: ${publishRes.error || "Unknown error"}. Please review.`
          }
        });

        return {
          error: publishRes.error || "Publishing failed via PostFast",
          status: "failed"
        };
      }
    } catch (err: any) {
      console.error("Error during PostFast publishing process:", err);

      await prisma.workUnit.update({
        where: { id: taskId },
        data: {
          status: "pending",
          requiredInput: `Internal error during publishing: ${err.message || String(err)}`
        }
      });

      return {
        error: err.message || String(err),
        status: "failed"
      };
    }
  }

  // 4. Manual / mockup draft generation flow
  const platformNameMap: Record<string, string> = {
    red: "小红书",
    xiaohongshu: "小红书",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    google_business: "Google Business"
  };
  const readablePlatform = platformNameMap[platform] || platform;

  console.log(`Platform ${platform} is unlinked or requires manual publishing. Generating draft.`);
  
  const draft = await prisma.contentDraft.create({
    data: {
      brandId,
      accountId: socialAccount.id,
      caption: fullCaption,
      mediaUrls: mediaUrls || [],
      hashtags: cleanHashtags,
      status: "draft",
      agentNote: `【手动发布提醒】此内容已生成。由于 ${readablePlatform} 账号未联通，请在草稿中手动复制发布。`
    }
  });

  await prisma.workUnit.update({
    where: { id: taskId },
    data: {
      status: "done",
      requiredInput: `Draft generated for manual publishing on ${readablePlatform}. Please review and copy it from the Drafts page: ${draft.id}`
    }
  });

  console.log(`WorkUnit ${taskId} successfully closed and marked as done. Manual draft created: ${draft.id}`);

  return {
    publishedUrl: `manual://${platform}/${draft.id}`,
    status: "done"
  };
}
