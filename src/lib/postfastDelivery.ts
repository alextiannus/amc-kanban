import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import {
  postfastPublish,
  postfastUploadPublicUrlStream,
  type PostFastMediaInput,
  type PostFastPublishInput,
  type PostFastPublishResult,
} from '@/lib/integrations/postfast'
import { syncBrandDraftStatuses, POSTFAST_RESULT_UNKNOWN } from '@/lib/syncDraftStatuses'

export const POSTFAST_DELIVERY_ACTIVE_STATUSES = ['QUEUED', 'TRANSFERRING', 'CREATING_POST', 'RESULT_UNKNOWN'] as const

const POSTFAST_DELIVERY_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]
const POSTFAST_DELIVERY_MAX_ATTEMPTS = 4
const POSTFAST_DELIVERY_LEASE_MS = 245_000
const POSTFAST_TRANSFER_TIMEOUT_MS = 210_000

type DeliveryMediaState = {
  version: 1
  items: Array<{ identity: string; storageKey: string }>
}

export type PostfastDeliveryPayload = {
  version: 1
  actorId: string
  note?: string | null
  immediatePublish: boolean
  scheduled: boolean
  draftUpdatedAt: string
  publish: Omit<PostFastPublishInput, 'apiKey'>
}

type QueueResult = {
  processed: number
  succeeded: number
  retried: number
  failed: number
  resultUnknown: number
  reconciled: number
}

function mediaIdentity(item: PostFastMediaInput, index: number) {
  return item.assetId || item.storageKey || item.url || `media-${index}`
}

function parseMediaState(value: unknown): DeliveryMediaState {
  if (!value || typeof value !== 'object') return { version: 1, items: [] }
  const raw = value as { items?: unknown }
  if (!Array.isArray(raw.items)) return { version: 1, items: [] }
  return {
    version: 1,
    items: raw.items.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const entry = item as { identity?: unknown; storageKey?: unknown }
      return typeof entry.identity === 'string' && typeof entry.storageKey === 'string'
        ? [{ identity: entry.identity, storageKey: entry.storageKey }]
        : []
    }),
  }
}

function submissionKey(draftId: string, payload: PostfastDeliveryPayload) {
  return createHash('sha256')
    .update(`${draftId}\n${payload.draftUpdatedAt}\n${JSON.stringify(payload.publish)}`)
    .digest('hex')
}

function jsonSnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function findActivePostfastDeliveryJob(draftId: string) {
  return prisma.postfastDeliveryJob.findFirst({
    where: { draftId, status: { in: [...POSTFAST_DELIVERY_ACTIVE_STATUSES] } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function enqueuePostfastDelivery(input: {
  brandId: string
  draftId: string
  actorId: string
  note?: string | null
  immediatePublish: boolean
  scheduled: boolean
  draftUpdatedAt: Date
  publish: Omit<PostFastPublishInput, 'apiKey'>
  warnings?: unknown[]
}) {
  const active = await findActivePostfastDeliveryJob(input.draftId)
  if (active) return active

  const payload = jsonSnapshot<PostfastDeliveryPayload>({
    version: 1,
    actorId: input.actorId,
    note: input.note,
    immediatePublish: input.immediatePublish,
    scheduled: input.scheduled,
    draftUpdatedAt: input.draftUpdatedAt.toISOString(),
    publish: input.publish,
  })
  const key = submissionKey(input.draftId, payload)
  const payloadJson = payload as unknown as Prisma.InputJsonValue
  const warningsJson = input.warnings
    ? jsonSnapshot(input.warnings) as unknown as Prisma.InputJsonValue
    : undefined

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const concurrent = await tx.postfastDeliveryJob.findFirst({
      where: { draftId: input.draftId, status: { in: [...POSTFAST_DELIVERY_ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    })
    if (concurrent) return concurrent

    const locked = await tx.contentDraft.updateMany({
      where: {
        id: input.draftId,
        brandId: input.brandId,
        status: { not: 'publishing' },
      },
      data: {
        status: 'publishing',
        deliveryFailureCode: null,
        deliveryFailureAt: null,
        agentNote: '大视频已进入后台发布队列，系统将在下一次任务运行时开始传输。',
      },
    })
    if (locked.count !== 1) {
      const activeAfterLock = await tx.postfastDeliveryJob.findFirst({
        where: { draftId: input.draftId, status: { in: [...POSTFAST_DELIVERY_ACTIVE_STATUSES] } },
        orderBy: { createdAt: 'desc' },
      })
      if (activeAfterLock) return activeAfterLock
      throw new Error('Draft is already publishing without an active PostFast delivery job.')
    }

    const existing = await tx.postfastDeliveryJob.findUnique({ where: { submissionKey: key } })
    const job = existing
      ? await tx.postfastDeliveryJob.update({
          where: { id: existing.id },
          data: {
            status: 'QUEUED',
            payload: payloadJson,
            mediaState: existing.mediaState ?? { version: 1, items: [] },
            warnings: warningsJson,
            attempts: 0,
            nextAttemptAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            postfastPostId: null,
            postUrl: null,
            completedAt: null,
          },
        })
      : await tx.postfastDeliveryJob.create({
          data: {
            brandId: input.brandId,
            draftId: input.draftId,
            submissionKey: key,
            payload: payloadJson,
            mediaState: { version: 1, items: [] },
            warnings: warningsJson,
          },
        })

    return job
  })
}

function retryablePublishFailure(result: PostFastPublishResult) {
  if (result.code === 'POSTFAST_PUBLISH_TIMEOUT') return true
  return /timeout|aborted|network|fetch|HTTP 429|HTTP 5\d\d/i.test(result.error || '')
}

async function updateDraftStage(draftId: string, agentNote: string, failureCode: string | null = null) {
  await prisma.contentDraft.update({
    where: { id: draftId },
    data: {
      status: 'publishing',
      agentNote,
      deliveryFailureCode: failureCode,
      deliveryFailureAt: failureCode ? new Date() : null,
    },
  })
}

async function queueRetry(job: { id: string; draftId: string; leaseToken: string | null; attempts: number }, code: string, message: string) {
  if (job.attempts >= POSTFAST_DELIVERY_MAX_ATTEMPTS) {
    await prisma.$transaction([
      prisma.postfastDeliveryJob.updateMany({
        where: { id: job.id, leaseToken: job.leaseToken },
        data: {
          status: 'FAILED',
          nextAttemptAt: null,
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: code,
          lastErrorMessage: message,
          completedAt: new Date(),
        },
      }),
      prisma.contentDraft.update({
        where: { id: job.draftId },
        data: {
          status: 'failed',
          deliveryFailureCode: code,
          deliveryFailureAt: new Date(),
          agentNote: `大视频发布失败：${message}`,
        },
      }),
    ])
    return 'failed' as const
  }

  const delay = POSTFAST_DELIVERY_RETRY_DELAYS_MS[Math.min(job.attempts - 1, POSTFAST_DELIVERY_RETRY_DELAYS_MS.length - 1)]
  const nextAttemptAt = new Date(Date.now() + delay)
  await prisma.$transaction([
    prisma.postfastDeliveryJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status: 'QUEUED',
        nextAttemptAt,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: code,
        lastErrorMessage: message,
      },
    }),
    prisma.contentDraft.update({
      where: { id: job.draftId },
      data: {
        status: 'publishing',
        deliveryFailureCode: code,
        deliveryFailureAt: new Date(),
        agentNote: `大视频传输暂时失败，将自动重试：${message}`,
      },
    }),
  ])
  return 'retried' as const
}

async function markPermanentFailure(job: { id: string; draftId: string; leaseToken: string | null }, code: string, message: string) {
  await prisma.$transaction([
    prisma.postfastDeliveryJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: code,
        lastErrorMessage: message,
        completedAt: new Date(),
      },
    }),
    prisma.contentDraft.update({
      where: { id: job.draftId },
      data: {
        status: 'failed',
        deliveryFailureCode: code,
        deliveryFailureAt: new Date(),
        agentNote: `大视频发布失败：${message}`,
      },
    }),
  ])
}

async function markResultUnknown(job: { id: string; draftId: string; leaseToken: string | null }, message: string) {
  await prisma.$transaction([
    prisma.postfastDeliveryJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status: 'RESULT_UNKNOWN',
        nextAttemptAt: null,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: POSTFAST_RESULT_UNKNOWN,
        lastErrorMessage: message,
      },
    }),
    prisma.contentDraft.update({
      where: { id: job.draftId },
      data: {
        status: 'publishing',
        deliveryFailureCode: POSTFAST_RESULT_UNKNOWN,
        deliveryFailureAt: new Date(),
        agentNote: 'PostFast 建帖结果暂时无法确认，系统正在对账，不会自动重复创建帖子。',
      },
    }),
  ])
}

async function finishSuccess(input: {
  job: { id: string; draftId: string; brandId: string; leaseToken: string | null }
  payload: PostfastDeliveryPayload
  result: PostFastPublishResult
  scheduled: boolean
  delayed: boolean
}) {
  const now = new Date()
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.postfastDeliveryJob.updateMany({
      where: { id: input.job.id, leaseToken: input.job.leaseToken },
      data: {
        status: 'SUCCEEDED',
        nextAttemptAt: null,
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        postfastPostId: input.result.postId,
        postUrl: input.result.url,
        warnings: input.result.warnings ? jsonSnapshot(input.result.warnings) : undefined,
        completedAt: now,
      },
    })
    const draft = await tx.contentDraft.update({
      where: { id: input.job.draftId },
      data: {
        status: input.scheduled ? 'scheduled' : 'published',
        platformPostId: input.result.postId || null,
        postUrl: input.result.url || null,
        publishedAt: input.scheduled ? null : now,
        deliveryFailureCode: null,
        deliveryFailureAt: null,
        rejectionNote: null,
        agentNote: input.delayed
          ? '原排期已过，大视频已完成传输并按立即发布提交。'
          : input.payload.note || (input.scheduled ? '大视频已完成传输并成功排期。' : '大视频已完成传输并成功发布。'),
      },
      include: {
        account: { select: { id: true, platformId: true, handle: true, displayName: true } },
        assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        coverAsset: true,
      },
    })
    await tx.actionItem.updateMany({
      where: { draftId: input.job.draftId, brandId: input.job.brandId, status: 'pending' },
      data: {
        status: 'approved',
        resolvedAt: now,
        resolvedBy: input.payload.actorId,
        resolvedNote: input.payload.note || '大视频后台发布成功',
      },
    })
    return draft
  })

  void persistDraftSnapshotToObs({ brandId: input.job.brandId, draftId: input.job.draftId, data: updated }).catch((error) => {
    console.error('[postfastDelivery] OBS delivered snapshot failed:', error)
  })
  void import('./feedbackService').then(({ processDraftCuration }) =>
    processDraftCuration(input.job.brandId, input.job.draftId, updated.caption),
  ).catch((error) => console.error('[postfastDelivery] feedback curation failed:', error))
}

async function claimNextJob() {
  const now = new Date()
  const candidate = await prisma.postfastDeliveryJob.findFirst({
    where: {
      status: 'QUEUED',
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
  })
  if (!candidate) return null

  const leaseToken = randomUUID()
  const claimed = await prisma.postfastDeliveryJob.updateMany({
    where: { id: candidate.id, status: 'QUEUED', updatedAt: candidate.updatedAt },
    data: {
      status: 'TRANSFERRING',
      attempts: { increment: 1 },
      leaseToken,
      leaseUntil: new Date(Date.now() + POSTFAST_DELIVERY_LEASE_MS),
      nextAttemptAt: null,
    },
  })
  if (claimed.count !== 1) return null
  return prisma.postfastDeliveryJob.findUniqueOrThrow({ where: { id: candidate.id } })
}

async function recoverExpiredLeases() {
  const now = new Date()
  const uncertain = await prisma.postfastDeliveryJob.findMany({
    where: { status: 'CREATING_POST', leaseUntil: { lt: now } },
    select: { id: true, draftId: true },
  })
  for (const job of uncertain) {
    await prisma.$transaction([
      prisma.postfastDeliveryJob.update({
        where: { id: job.id },
        data: {
          status: 'RESULT_UNKNOWN',
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: null,
          lastErrorCode: POSTFAST_RESULT_UNKNOWN,
          lastErrorMessage: 'Worker lease expired while creating the PostFast post.',
        },
      }),
      prisma.contentDraft.update({
        where: { id: job.draftId },
        data: {
          status: 'publishing',
          deliveryFailureCode: POSTFAST_RESULT_UNKNOWN,
          deliveryFailureAt: now,
          agentNote: 'PostFast 建帖阶段中断，系统正在对账，不会自动重复创建帖子。',
        },
      }),
    ])
  }

  await prisma.postfastDeliveryJob.updateMany({
    where: { status: 'TRANSFERRING', leaseUntil: { lt: now } },
    data: {
      status: 'QUEUED',
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastErrorCode: 'POSTFAST_TRANSFER_INTERRUPTED',
      lastErrorMessage: 'Worker lease expired during media transfer.',
    },
  })
}

async function reconcileUnknownJobs() {
  const jobs = await prisma.postfastDeliveryJob.findMany({
    where: { status: 'RESULT_UNKNOWN' },
    include: {
      brand: { select: { postfastApiKey: true } },
      draft: { select: { status: true, deliveryFailureCode: true, platformPostId: true, postUrl: true } },
    },
  }) as Array<{
    id: string
    brandId: string
    brand: { postfastApiKey: string | null }
    draft: { status: string; deliveryFailureCode: string | null; platformPostId: string | null; postUrl: string | null }
  }>
  const brandIds: string[] = [...new Set<string>(
    jobs
      .filter((job) => job.brand.postfastApiKey)
      .map((job) => String(job.brandId)),
  )]
  for (const brandId of brandIds) {
    const job = jobs.find((item) => item.brandId === brandId && item.brand.postfastApiKey)
    if (job?.brand.postfastApiKey) {
      await syncBrandDraftStatuses(brandId, job.brand.postfastApiKey, { quiet: true })
    }
  }

  let reconciled = 0
  for (const original of jobs) {
    const current = await prisma.postfastDeliveryJob.findUnique({
      where: { id: original.id },
      include: { draft: { select: { status: true, deliveryFailureCode: true, platformPostId: true, postUrl: true } } },
    })
    if (!current || current.status !== 'RESULT_UNKNOWN') continue
    if (current.draft.platformPostId && ['scheduled', 'published'].includes(current.draft.status)) {
      const payload = current.payload as unknown as PostfastDeliveryPayload
      if (payload.immediatePublish && current.draft.status === 'scheduled') {
        await prisma.contentDraft.update({
          where: { id: current.draftId },
          data: { status: 'published', publishedAt: new Date() },
        })
      }
      await prisma.$transaction([
        prisma.postfastDeliveryJob.update({
          where: { id: current.id },
          data: {
            status: 'SUCCEEDED',
            postfastPostId: current.draft.platformPostId,
            postUrl: current.draft.postUrl,
            completedAt: new Date(),
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        }),
        prisma.actionItem.updateMany({
          where: { draftId: current.draftId, brandId: current.brandId, status: 'pending' },
          data: {
            status: 'approved',
            resolvedAt: new Date(),
            resolvedBy: payload.actorId,
            resolvedNote: payload.note || '大视频后台发布结果已完成对账',
          },
        }),
      ])
      reconciled += 1
    } else if (current.draft.status === 'failed' && current.draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN) {
      await prisma.postfastDeliveryJob.update({
        where: { id: current.id },
        data: { status: 'FAILED', completedAt: new Date() },
      })
      reconciled += 1
    }
  }
  return reconciled
}

async function processClaimedJob(job: Awaited<ReturnType<typeof claimNextJob>>, deadlineAt: number) {
  if (!job) return 'none' as const
  const payload = job.payload as unknown as PostfastDeliveryPayload
  if (!payload || payload.version !== 1 || !payload.publish || !Array.isArray(payload.publish.mediaItems)) {
    await markPermanentFailure(job, 'POSTFAST_JOB_PAYLOAD_INVALID', 'The saved delivery snapshot is invalid.')
    return 'failed' as const
  }
  const brand = await prisma.brand.findUnique({ where: { id: job.brandId }, select: { postfastApiKey: true } })
  if (!brand?.postfastApiKey) {
    await markPermanentFailure(job, 'POSTFAST_NOT_CONFIGURED', 'Brand has no PostFast API key.')
    return 'failed' as const
  }

  await updateDraftStage(job.draftId, '大视频正在从 OBS 流式传输到 PostFast。')
  const state = parseMediaState(job.mediaState)
  const storedByIdentity = new Map(state.items.map((item) => [item.identity, item.storageKey]))
  const uploadedItems: PostFastMediaInput[] = []
  const sourceItems = payload.publish.mediaItems || []

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index]
    const identity = mediaIdentity(item, index)
    const existingKey = item.storageKey || storedByIdentity.get(identity)
    if (existingKey) {
      uploadedItems.push({ ...item, storageKey: existingKey, url: undefined })
      continue
    }
    if (!item.url || !item.metadata || !item.metadata.mimeType || !item.metadata.sizeBytes) {
      await markPermanentFailure(job, 'POSTFAST_MEDIA_METADATA_MISSING', `Media ${identity} is missing a readable URL or technical metadata.`)
      return 'failed' as const
    }

    const upload = await postfastUploadPublicUrlStream({
      apiKey: brand.postfastApiKey,
      url: item.url,
      filename: item.filename,
      mimeType: item.metadata.mimeType,
      sizeBytes: item.metadata.sizeBytes,
      timeoutMs: Math.max(1_000, Math.min(POSTFAST_TRANSFER_TIMEOUT_MS, deadlineAt - Date.now() - 25_000)),
    })
    if (!upload.success || !upload.storageKey) {
      if (upload.retryable) {
        return queueRetry(job, upload.code || 'POSTFAST_TRANSFER_FAILED', upload.error || 'Media transfer failed.')
      }
      await markPermanentFailure(job, upload.code || 'POSTFAST_TRANSFER_FAILED', upload.error || 'Media transfer failed.')
      return 'failed' as const
    }

    storedByIdentity.set(identity, upload.storageKey)
    const nextState: DeliveryMediaState = {
      version: 1,
      items: [...storedByIdentity].map(([storedIdentity, storageKey]) => ({ identity: storedIdentity, storageKey })),
    }
    const renewed = await prisma.postfastDeliveryJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        mediaState: nextState,
        leaseUntil: new Date(Date.now() + POSTFAST_DELIVERY_LEASE_MS),
      },
    })
    if (renewed.count !== 1) return 'none' as const
    uploadedItems.push({ ...item, storageKey: upload.storageKey, url: undefined })
  }

  if (Date.now() >= deadlineAt - 25_000) {
    return queueRetry(job, 'POSTFAST_JOB_BUDGET_EXHAUSTED', 'Media transfer completed too close to the job deadline; post creation was safely deferred.')
  }

  const originalScheduledAt = payload.publish.scheduledAt ? new Date(payload.publish.scheduledAt) : null
  const delayed = !payload.immediatePublish && !!originalScheduledAt && originalScheduledAt.getTime() <= Date.now() + 60_000
  const effectiveScheduledAt = payload.immediatePublish || delayed
    ? new Date(Date.now() + 2 * 60_000).toISOString()
    : payload.publish.scheduledAt
  const scheduled = payload.scheduled && !delayed

  const creating = await prisma.postfastDeliveryJob.updateMany({
    where: { id: job.id, leaseToken: job.leaseToken },
    data: {
      status: 'CREATING_POST',
      leaseUntil: new Date(Date.now() + POSTFAST_DELIVERY_LEASE_MS),
      mediaState: {
        version: 1,
        items: [...storedByIdentity].map(([identity, storageKey]) => ({ identity, storageKey })),
      },
    },
  })
  if (creating.count !== 1) return 'none' as const
  await updateDraftStage(job.draftId, '大视频已传输完成，正在创建 PostFast 帖子。')

  const result = await postfastPublish({
    ...payload.publish,
    apiKey: brand.postfastApiKey,
    mediaItems: uploadedItems,
    mediaUrls: undefined,
    mediaStorageKeys: undefined,
    scheduledAt: effectiveScheduledAt,
  })
  if (result.success) {
    await finishSuccess({ job, payload, result, scheduled, delayed })
    return 'succeeded' as const
  }
  if (result.code === POSTFAST_RESULT_UNKNOWN) {
    await markResultUnknown(job, result.error || 'PostFast post creation result is unknown.')
    return 'unknown' as const
  }
  if (retryablePublishFailure(result)) {
    return queueRetry(job, result.code || 'POSTFAST_PUBLISH_FAILED', result.error || 'PostFast publish failed.')
  }
  await markPermanentFailure(job, result.code || 'POSTFAST_PUBLISH_FAILED', result.error || 'PostFast publish failed.')
  return 'failed' as const
}

export async function processPostfastDeliveryQueue(options: { maxRuntimeMs?: number } = {}): Promise<QueueResult> {
  const startedAt = Date.now()
  const maxRuntimeMs = Math.max(30_000, options.maxRuntimeMs ?? 240_000)
  const deadlineAt = startedAt + maxRuntimeMs
  const result: QueueResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    resultUnknown: 0,
    reconciled: 0,
  }

  await recoverExpiredLeases()
  result.reconciled = await reconcileUnknownJobs()
  while (Date.now() - startedAt < maxRuntimeMs - 10_000) {
    const job = await claimNextJob()
    if (!job) break
    result.processed += 1
    const outcome = await processClaimedJob(job, deadlineAt)
    if (outcome === 'succeeded') result.succeeded += 1
    if (outcome === 'retried') result.retried += 1
    if (outcome === 'failed') result.failed += 1
    if (outcome === 'unknown') result.resultUnknown += 1
  }
  return result
}
