import fs from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { postfastPublish } from "../../lib/integrations/postfast.ts";
import { extractTopicKeywords } from "../../lib/topicExtractor.ts";
import { buildPostfastMediaItems } from "../../lib/publishMedia.ts";
import { validateDraftMediaForPlatform } from "../../lib/publishMediaValidation.ts";
import { blockingMediaIssues } from "../../lib/mediaValidation.ts";
import { cleanupDisposableAiPlaceholderDraft, isAiDraftPlaceholder } from "../../lib/draftCleanup.ts";

/**
 * 萃取草稿主题关键词，写入 topicKeywords 字段。
 * 注意：重复主题检测由 Scheduler 定时巡检（07:00/14:00）负责，不在此处实时检查。
 */
function enrichDraftData(caption: string): { topicKeywords: string[] } {
  return { topicKeywords: extractTopicKeywords(caption) }
}

type DraftForPublish = Prisma.ContentDraftGetPayload<{
  include: {
    assetRefs: {
      include: { asset: true }
    }
  }
}>

export async function publisherNode(state: any) {
  console.log("=== PublisherNode Running ===");
  if (state.status === "pending" || state.status === "failed") {
    return state;
  }
  const { brandId, taskId, platform, caption, mediaUrls, hashtags, copywriteOnly } = state;

  if (!brandId || !taskId) {
    throw new Error("Missing brandId or taskId in state.");
  }

  // 1. Fetch task and brand details
  const task = await prisma.workUnit.findUnique({
    where: { id: taskId }
  });

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

  // Extract draft ID if present
  let existingDraftId = state.draftId || null;
  if (!existingDraftId && task) {
    if (task.description) {
      const match = task.description.match(/(?:草稿|Draft)\s*ID:\s*([a-z0-9]{25,})/i);
      if (match) {
        existingDraftId = match[1];
      }
    }
    if (!existingDraftId && task.materials) {
      const match = task.materials.match(/(?:草稿|Draft)\s*ID:\s*([a-z0-9]{25,})/i);
      if (match) {
        existingDraftId = match[1];
      }
    }
  }

  if (state.aiFailed) {
    console.log(`AI Copywriting failed for task ${taskId}. Checking for rule-based fallback content...`)

    // Strip the error-prefix banner that copywriterNode prepends to the fallback caption
    // so users get clean, editable content rather than an ugly error string.
    const rawCaption: string = state.caption || ''
    const fallbackCaption = rawCaption
      .replace(/^【⚠️ AI 智能写作未成功：[\s\S]*?】\n\n/, '')
      .trim()
    const fallbackHashtags: string[] = state.hashtags || []
    const hasFallback = !state.requireAmcContent && !!fallbackCaption && fallbackCaption !== '【AI 正在创作中...】'

    if (existingDraftId) {
      try {
        // Clean up designer-generated assets (still appropriate on failure)
        const assetRefs = await prisma.contentAssetRef.findMany({
          where: { draftId: existingDraftId },
          include: { asset: true }
        })
        for (const ref of assetRefs) {
          const asset = ref.asset
          if (asset && (asset.sourceType === 'designer' || asset.sourceType === 'postfast' || asset.sourceType === 'huawei_obs' || asset.aiCategory === 'optimized_media' || asset.aiCategory === 'watermarked_cover')) {
            const otherRefs = await prisma.contentAssetRef.count({
              where: { assetId: asset.id, draftId: { not: existingDraftId } }
            })
            if (otherRefs === 0) {
              await prisma.mediaAsset.delete({ where: { id: asset.id } })
              if (asset.url.startsWith('/uploads/')) {
                const localPath = path.join(process.cwd(), 'public', asset.url)
                if (fs.existsSync(localPath)) fs.unlinkSync(localPath)
              }
            }
          }
        }
        await prisma.actionItem.deleteMany({ where: { draftId: existingDraftId } })
        await prisma.contentAssetRef.deleteMany({ where: { draftId: existingDraftId } })

        if (hasFallback) {
          // Save rule-based fallback content as an editable 'draft' — user can review and publish
          await prisma.contentDraft.update({
            where: { id: existingDraftId },
            data: {
              status: 'draft',
              caption: fallbackCaption,
              hashtags: fallbackHashtags,
              agentNote: `AI 智能写作失败（${state.error || 'LLM 所有通道均不可用'}），已自动降级为规则引擎内容，请检查后编辑再发布。`,
            }
          })
          console.log(`Saved rule-based fallback to draft ${existingDraftId} (status: draft).`)
        } else {
          // No content at all. System-created placeholder drafts have no
          // merchant value, so remove them instead of leaving failed calendar noise.
          const failureReason = state.requireAmcContent
            ? (state.error || state.complianceReason || 'amc-content Copywriter 创作失败，请重新创作或检查内容服务配置。')
            : (state.complianceReason || state.error || 'AI Copywriting failed')
          const existingDraft = await prisma.contentDraft.findUnique({
            where: { id: existingDraftId },
            select: { caption: true, platformPostId: true, postUrl: true, publishedAt: true },
          })
          const cleaned = existingDraft && isAiDraftPlaceholder(existingDraft.caption)
            ? await cleanupDisposableAiPlaceholderDraft({ brandId, draftId: existingDraftId, reason: failureReason })
            : false
          if (!cleaned) {
            await prisma.contentDraft.update({
              where: { id: existingDraftId },
              data: { status: 'failed', agentNote: failureReason }
            })
            console.log(`No fallback content; marked draft ${existingDraftId} as failed.`)
          }
        }
      } catch (e) {
        console.warn(`Failed to update draft ${existingDraftId} on aiFailed:`, e)
      }
    }

    await prisma.workUnit.update({
      where: { id: taskId },
      data: {
        status: hasFallback ? 'done' : 'failed',
        requiredInput: hasFallback
          ? null
          : `AI Copywriting failed — no fallback content generated.`
      }
    })
    return {
      status: hasFallback ? 'completed' : 'failed',
      error: hasFallback ? undefined : 'AI Copywriting failed'
    }
  }

  const cleanHashtags = hashtags || [];
  const fullCaption = `${caption}\n\n${cleanHashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(" ")}`;

  if (copywriteOnly) {
    console.log("Publisher Node: copywriteOnly is true. Updating draft caption and hashtags, and completing task.");
    if (existingDraftId) {
      const draft = await prisma.contentDraft.findUnique({
        where: { id: existingDraftId }
      });
      if (draft) {
        await prisma.contentDraft.update({
          where: { id: existingDraftId },
          data: {
            caption: fullCaption,
            hashtags: cleanHashtags
          }
        });
        console.log(`Updated draft ${existingDraftId} caption and hashtags.`);
      }
    }

    await prisma.workUnit.update({
      where: { id: taskId },
      data: {
        status: "done",
        requiredInput: `AI Copywriting completed successfully.`
      }
    });

    return {
      publishedUrl: existingDraftId ? `manual://${platform}/${existingDraftId}` : "",
      status: "done"
    };
  }

  const dbPlatformId = platform === "red" || platform === "xhs" ? "xiaohongshu"
                     : platform === "google_business" ? "google_maps"
                     : platform;

  // 2. Fetch or create a social account record for logging
  let socialAccount = await prisma.socialAccount.findFirst({
    where: {
      brandId,
      platformId: dbPlatformId
    }
  });

  if (!socialAccount) {
    console.log(`No social account found for brand ${brandId} on ${dbPlatformId}. Creating a mock account.`);
    socialAccount = await prisma.socialAccount.create({
      data: {
        brandId,
        platformId: dbPlatformId,
        handle: "mock_" + dbPlatformId + "_handle",
        displayName: "Mock " + (platform === "red" || platform === "xhs" || platform === "xiaohongshu" ? "小红书" : platform === "google_business" || platform === "google_maps" ? "Google Business" : platform) + " Account",
        autoPilot: true
      }
    });
  }

  const isMockAccount = socialAccount.handle?.startsWith("mock_") || !brand.postfastApiKey;
  const isManualPlatform = platform === "red" || platform === "xiaohongshu";

  // 3. Execute publishing via PostFast if API Key is configured and account is connected and supports auto-publish
  if (brand.postfastApiKey && !isMockAccount && !isManualPlatform) {
    let draftForPublish: DraftForPublish | null = null
    let originalDraftStatus: string | null = null

    if (existingDraftId) {
      draftForPublish = await prisma.contentDraft.findUnique({
        where: { id: existingDraftId },
        include: { assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } } },
      })
      originalDraftStatus = draftForPublish?.status ?? null

      if (draftForPublish) {
        try {
          const issues = await validateDraftMediaForPlatform({
            platform,
            mediaUrls: draftForPublish.mediaUrls,
            assetRefs: draftForPublish.assetRefs,
          })
          const blockingIssues = blockingMediaIssues(issues)
          if (blockingIssues.length > 0) {
            const error = JSON.stringify({
              code: 'MEDIA_VALIDATION_FAILED',
              error: '素材不符合发布要求',
              issues: blockingIssues,
            })
            await prisma.workUnit.update({
              where: { id: taskId },
              data: { status: 'pending', requiredInput: error },
            })
            return { error, status: 'failed' }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await prisma.workUnit.update({
            where: { id: taskId },
            data: {
              status: 'pending',
              requiredInput: JSON.stringify({
                code: 'MEDIA_INSPECTION_UNAVAILABLE',
                error: message,
                issues: [],
              }),
            },
          })
          return { error: message, status: 'failed' }
        }
      }
    }

    // ── 原子互斥锁：与 submitDraftForDelivery（人工审批路径）保持完全一致 ──
    // 如果 existingDraftId 已通过其他路径（API approve/submit）进入 'publishing' 或
    // 'published' 状态，则跳过发布，防止 Agent 路径与 API 路径双重发帖。
    if (existingDraftId) {
      const lockResult = await prisma.contentDraft.updateMany({
        where: {
          id: existingDraftId,
          status: { notIn: ['publishing', 'published', 'scheduled'] },
        },
        data: { status: 'publishing' },
      })
      if (lockResult.count === 0) {
        console.warn(`[publisherNode] Draft ${existingDraftId} is already being published or published by another path, skipping PostFast call to prevent duplicate post`)
        await prisma.workUnit.update({
          where: { id: taskId },
          data: { status: 'done', requiredInput: 'Draft already published by another path. Skipped duplicate PostFast call.' },
        })
        return { ...state, status: 'done', publishedUrl: `skipped://duplicate/${existingDraftId}` }
      }
      console.log(`[publisherNode] Lock acquired for draft ${existingDraftId}, proceeding with PostFast publish`)
    }

    console.log(`Brand ${brand.name} has PostFast API key. Initiating actual social media publish...`);
    try {
      // Build mediaItems preserving mimeType so videos are not misidentified as images.
      // When existingDraftId is set, read assetRefs from DB; otherwise fall back to plain URLs.
      let publishMediaItems: ReturnType<typeof buildPostfastMediaItems> | undefined
      if (existingDraftId) {
        publishMediaItems = buildPostfastMediaItems({
          mediaUrls: mediaUrls || [],
          assetRefs: draftForPublish?.assetRefs,
        })
      }

      const publishRes = await postfastPublish({
        apiKey: brand.postfastApiKey,
        platform,
        caption,
        ...(publishMediaItems ? { mediaItems: publishMediaItems } : { mediaUrls: mediaUrls || [] }),
        hashtags: cleanHashtags,
        accountId: socialAccount.id
      });

      if (publishRes.success) {
        const publishedUrl = publishRes.url || `https://www.${platform}.com/p/amc_mock_${Date.now()}`;
        console.log(`PostFast Publish Success! Post ID: ${publishRes.postId}, URL: ${publishedUrl}`);

        // Log the published draft
        let draftRecord;
        if (existingDraftId) {
          try {
            draftRecord = await prisma.contentDraft.update({
              where: { id: existingDraftId },
              data: {
                accountId: socialAccount.id,
                caption: fullCaption,
                mediaUrls: mediaUrls || [],
                hashtags: cleanHashtags,
                status: "published",
                platformPostId: publishRes.postId || "post_" + Date.now(),
                postUrl: publishRes.url || null,
                publishedAt: new Date()
              }
            });
            console.log(`Updated existing draft ${existingDraftId} to published.`);
          } catch (e) {
            console.warn(`Failed to update existing draft ${existingDraftId} to published, fallback to create.`, e);
          }
        }

        if (!draftRecord) {
          const enriched = enrichDraftData(fullCaption)
          draftRecord = await prisma.contentDraft.create({
            data: {
              brandId,
              accountId: socialAccount.id,
              caption: fullCaption,
              mediaUrls: mediaUrls || [],
              hashtags: cleanHashtags,
              status: "published",
              platformPostId: publishRes.postId || "post_" + Date.now(),
              postUrl: publishRes.url || null,
              publishedAt: new Date(),
              topicKeywords: enriched.topicKeywords,
            }
          });
        }

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
        const transientFailure = publishRes.code === 'MEDIA_VALIDATION_FAILED'
          || publishRes.code === 'MEDIA_INSPECTION_UNAVAILABLE'
          || publishRes.code === 'POSTFAST_PUBLISH_TIMEOUT'
        
        // Log draft with failed status
        let draftRecord;
        if (existingDraftId) {
          try {
            draftRecord = await prisma.contentDraft.update({
              where: { id: existingDraftId },
              data: transientFailure
                ? { status: originalDraftStatus ?? 'draft' }
                : {
                    accountId: socialAccount.id,
                    caption: fullCaption,
                    mediaUrls: mediaUrls || [],
                    hashtags: cleanHashtags,
                    status: "failed",
                    agentNote: `PostFast Publish Failed: ${publishRes.error || "Unknown error"}`
                  }
            });
            console.log(transientFailure
              ? `Restored existing draft ${existingDraftId} after transient publish failure.`
              : `Updated existing draft ${existingDraftId} to failed.`)
          } catch (e) {
            console.warn(`Failed to update existing draft ${existingDraftId} to failed, fallback to create.`, e);
          }
        }

        if (!draftRecord && !transientFailure) {
          const enriched = enrichDraftData(fullCaption)
          await prisma.contentDraft.create({
            data: {
              brandId,
              accountId: socialAccount.id,
              caption: fullCaption,
              mediaUrls: mediaUrls || [],
              hashtags: cleanHashtags,
              status: "failed",
              agentNote: `PostFast Publish Failed: ${publishRes.error || "Unknown error"}`,
              topicKeywords: enriched.topicKeywords,
            }
          });
        }

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
  
  let draft;
  if (existingDraftId) {
    try {
      draft = await prisma.contentDraft.update({
        where: { id: existingDraftId },
        data: {
          accountId: socialAccount.id,
          caption: fullCaption,
          mediaUrls: mediaUrls || [],
          hashtags: cleanHashtags,
          status: "draft",
          agentNote: `【手动发布提醒】此内容已更新。由于 ${readablePlatform} 账号未联通，请在草稿中手动复制发布。`
        }
      });
      console.log(`ContentDraft ${existingDraftId} updated in-place successfully.`);
    } catch (e) {
      console.warn(`Failed to update existing draft ${existingDraftId}, fallback to create.`, e);
    }
  }

  if (!draft) {
    const enriched = enrichDraftData(fullCaption)
    const manualNote = `【手动发布提醒】此内容已生成。由于 ${readablePlatform} 账号未联通，请在草稿中手动复制发布。`
    draft = await prisma.contentDraft.create({
      data: {
        brandId,
        accountId: socialAccount.id,
        caption: fullCaption,
        mediaUrls: mediaUrls || [],
        hashtags: cleanHashtags,
        status: "draft",
        agentNote: manualNote,
        topicKeywords: enriched.topicKeywords,
      }
    });
  }

  await prisma.workUnit.update({
    where: { id: taskId },
    data: {
      status: "done",
      requiredInput: `Draft generated for manual publishing on ${readablePlatform}. Please review and copy it from the Drafts page: ${draft.id}`
    }
  });

  console.log(`WorkUnit ${taskId} successfully closed and marked as done. Draft ID: ${draft.id}`);

  return {
    publishedUrl: `manual://${platform}/${draft.id}`,
    status: "done"
  };
}
