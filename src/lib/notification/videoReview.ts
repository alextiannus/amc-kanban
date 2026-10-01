import { createHash } from 'node:crypto'
import { prisma } from '../prisma'
import { canSessionAccessBrandProject } from '../brandAccess'

/** A self-addressed inbox receipt; never sends email, chat or push. */
export async function notifyVideoReview(userId: string, input: unknown) {
  const body = input as { videoJobId?: unknown }
  const id = typeof body?.videoJobId === 'string' ? body.videoJobId.trim() : ''
  if (!id || id.length > 200) throw Object.assign(new Error('video_job_required'), { status: 400, code: 'video_job_required' })
  const job = await prisma.videoProductionJob.findUnique({ where: { id } })
  if (!job || !await canSessionAccessBrandProject(job.brandId, userId, 'HUMAN')) {
    throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' })
  }
  if (job.status !== 'completed' || !job.finalVideoUrl) {
    throw Object.assign(new Error('video_not_ready'), { status: 409, code: 'video_not_ready' })
  }
  const notificationId = `video-review-${createHash('sha256').update(JSON.stringify([userId, id])).digest('hex')}`
  const notification = await prisma.notification.upsert({
    where: { id: notificationId }, update: {},
    create: {
      id: notificationId, userId, brandId: job.brandId, type: 'content_draft',
      title: '视频草稿已生成，请查看与修改',
      message: `${job.title}：已完成视频生成。你可以打开视频制作页进行 Review 和修改；发布前仍需你确认。`,
      actionUrl: `/dashboard?action=video_review&brandId=${encodeURIComponent(job.brandId)}&jobId=${encodeURIComponent(id)}`,
    },
  })
  return { ok: true, notification }
}
