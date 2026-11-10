import { prisma } from '../prisma';
import { dailyAccess, dailyStatus } from './service';
import { dailyDb } from './store';
import { validateDailyDraft } from './sources';
import { postInclude, postRevision, postContentRevision } from '../video-assistant/post-contract';
import { submitDraftForDelivery } from '../draftSubmission';
import { requireActorPermission } from '../role-permissions/delegation';
export async function approveDaily(userId: string, brandId: string, body: any) {
    await dailyAccess(userId, brandId);
    for (const permission of ['draft.submit', 'content.schedule', 'content.publish'])
        await requireActorPermission(userId, permission, brandId);
    if (typeof body.draftId !== 'string' || typeof body.revision !== 'string' || body.confirmed !== true || body.rightsConfirmed !== true)
        throw Object.assign(Error('daily_approval_required'), { status: 400 });
    const pool = await dailyDb(), slot = (await pool.query('SELECT s.* FROM amc_iaic.daily_publishing_slots s JOIN amc_iaic.daily_publishing_policy p ON p.brand_id=s.brand_id AND p.enabled=true AND p.owner_id=$3 AND p.revision=s.policy_revision WHERE s.brand_id=$1 AND s.draft_id=$2 AND s.account_id=ANY(p.account_ids)', [brandId, body.draftId, userId])).rows[0];
    const draft = await prisma.contentDraft.findFirst({ where: { id: body.draftId, brandId }, include: postInclude });
    if (!slot || !draft || postRevision(draft) !== body.revision || !await validateDailyDraft(draft) || !draft.scheduledAt || draft.scheduledAt.getTime() !== slot.scheduled_at.getTime() || slot.scheduled_at.getTime() <= Date.now() + 5 * 60000)
        throw Object.assign(Error('daily_approval_stale'), { status: 409 });
    const result = await submitDraftForDelivery({ brandId, draftId: draft.id, actorId: userId, forcePublish: true, approvedVideoPost: { revision: body.revision, contentRevision: postContentRevision(draft), scheduledAt: slot.scheduled_at.toISOString() } });
    if (result.ok)
        await pool.query("UPDATE amc_iaic.daily_publishing_slots SET stage='submitted',updated_at=now() WHERE id=$1", [slot.id]);
    return { result, status: await dailyStatus(userId, brandId) };
}
