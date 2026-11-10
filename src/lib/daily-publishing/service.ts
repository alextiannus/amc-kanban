import { prisma } from '../prisma';
import { requireAutopilotOwner } from '../ai-native/autopilot-store';
import { requireActorPermission } from '../role-permissions/delegation';
import { dailyDb } from './store';
import { AMC_BRAND_ID, dailySlots, inventory, pickSource, sourceFingerprint } from './policy';
import { dailySources, validateDailySource } from './sources';
import { composeDaily } from './content';
import { mediaDigest, postRevision, postInclude } from '../video-assistant/post-contract';
const fail = (code: string, status = 409): never => { throw Object.assign(Error(code), { code, status }); };
export async function dailyAccess(userId: string, brandId: string, write = false) {
    if (brandId !== AMC_BRAND_ID)
        fail('daily_amc_brand_required', 403);
    await requireAutopilotOwner(userId, brandId, write);
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, businessRoles: true } });
    if (actor?.role !== 'ADMIN' && !actor?.businessRoles.some((r: any) => r.role === 'ADMIN'))
        fail('daily_cross_brand_admin_required', 403);
    await requireActorPermission(userId, write ? 'draft.create' : 'draft.read', brandId);
}
export async function configureDaily(userId: string, brandId: string, body: any) {
    await dailyAccess(userId, brandId, true);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, businessRoles: true } });
    if (user?.role !== 'ADMIN' && !user?.businessRoles.some((r: any) => r.role === 'ADMIN'))
        fail('daily_cross_brand_admin_required', 403);
    if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.revision) || !Array.isArray(body.accountIds) || body.accountIds.length < 1 || body.accountIds.length > 5 || body.accountIds.some((x: any) => typeof x !== 'string') || new Set(body.accountIds).size !== body.accountIds.length)
        fail('daily_policy_invalid', 400);
    const accounts = await prisma.socialAccount.findMany({ where: { id: { in: body.accountIds }, brandId, unboundAt: null, platformId: { in: ['instagram', 'facebook'] } }, select: { id: true } });
    if (accounts.length !== body.accountIds.length)
        fail('daily_account_unavailable', 422);
    const pool = await dailyDb(), c = await pool.connect();
    try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['daily-policy:' + brandId]);
        const old = (await c.query('SELECT revision FROM amc_iaic.daily_publishing_policy WHERE brand_id=$1', [brandId])).rows[0];
        if ((old?.revision || 0) !== body.revision)
            fail('daily_policy_conflict');
        await c.query(`INSERT INTO amc_iaic.daily_publishing_policy(brand_id,owner_id,account_ids,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(brand_id) DO UPDATE SET owner_id=$2,account_ids=$3,enabled=$4,revision=daily_publishing_policy.revision+1,updated_at=now()`, [brandId, userId, body.accountIds, body.enabled]);
        await c.query(`INSERT INTO public."AuditLog"(id,"actorId","actorType",action,"resourceType","resourceId",metadata,timestamp) VALUES($1,$2,'HUMAN','DAILY_PUBLISHING_CONFIGURED','Brand',$3,$4,now())`, [crypto.randomUUID(), userId, brandId, JSON.stringify({ accountIds: body.accountIds, enabled: body.enabled, sourceScope: 'AMC libraries, published posts, Academy', approval: 'exact_human_confirmation', reserveDays: 7, postsPerAccountDay: 1 })]);
        await c.query('COMMIT');
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
    return dailyStatus(userId, brandId);
}
export async function dailyStatus(userId: string, brandId: string) {
    await dailyAccess(userId, brandId);
    const pool = await dailyDb(), policy = (await pool.query('SELECT * FROM amc_iaic.daily_publishing_policy WHERE brand_id=$1', [brandId])).rows[0] || null;
    const slots = (await pool.query('SELECT * FROM amc_iaic.daily_publishing_slots WHERE brand_id=$1 AND scheduled_at>now()-interval \'7 days\' ORDER BY scheduled_at,account_id', [brandId])).rows;
    const drafts = await prisma.contentDraft.findMany({ where: { brandId, OR: [{ id: { in: slots.map(s => s.draft_id).filter(Boolean) } }, { scheduledAt: { gte: new Date(Date.now() - 7 * 86400000) } }] }, include: postInclude, orderBy: { scheduledAt: 'asc' } });
    return { operationsUrl: 'https://amc-kanban.immedi.ai/daily-publishing', policy, timezone: 'Asia/Singapore', reserveDays: 7, approval: 'human_exact_content_account_schedule', accounts: await prisma.socialAccount.findMany({ where: { brandId, unboundAt: null, platformId: { in: ['instagram', 'facebook'] } }, select: { id: true, platformId: true, handle: true, displayName: true } }), slots, drafts: drafts.map((d: any) => ({ id: d.id, caption: d.caption, hashtags: d.hashtags, accountId: d.accountId, status: d.status, scheduledAt: d.scheduledAt, publishedAt: d.publishedAt, postUrl: d.postUrl, deliveryFailureCode: d.deliveryFailureCode, revision: postRevision(d), assetRefs: d.assetRefs.map((r: any) => ({ assetId: r.assetId, asset: { filename: r.asset.filename, url: r.asset.url, mimeType: r.asset.mimeType } })) })), inventory: (policy?.account_ids || []).map((accountId: string) => ({ accountId, ...inventory(dailySlots(), drafts.filter((d: any) => d.accountId === accountId)) })) };
}
export async function dailyNotice(ownerId: string, brandId: string, accountId: string, kind: string, day: string, message: string, db: any = prisma) {
    await db.notification.createMany({ data: [{ id: 'daily-' + mediaDigest([brandId, ownerId, accountId, kind, day]).slice(0, 45), userId: ownerId, brandId, type: 'WARNING', title: kind === 'failure' ? '日更发布需要处理' : '日更内容储备需要审核', message, actionUrl: `https://amc-kanban.immedi.ai/daily-publishing?brandId=${brandId}` }], skipDuplicates: true });
}
export const dailyAdapters = { compose: composeDaily, sources: dailySources, validate: validateDailySource, now: () => new Date() };
export async function refillDaily(brandId = AMC_BRAND_ID, adapters = dailyAdapters, maxCreates = 3) {
    if (brandId !== AMC_BRAND_ID)
        fail('daily_amc_brand_required', 403);
    const pool = await dailyDb(), c = await pool.connect();
    let locked = false, attempted = 0, created = 0;
    try {
        locked = !!(await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0))', ['daily-refill:' + brandId])).rows[0].pg_try_advisory_lock;
        if (!locked)
            return { busy: true, attempted:0, created: 0 };
        const policy = (await c.query('SELECT * FROM amc_iaic.daily_publishing_policy WHERE brand_id=$1 AND enabled=true', [brandId])).rows[0];
        if (!policy)
            return { disabled: true, attempted:0, created: 0 };
        await dailyAccess(policy.owner_id, brandId, true);
        await c.query("UPDATE amc_iaic.daily_publishing_slots SET stage='needs_attention',error='interrupted_generation_requires_reconciliation',updated_at=now() WHERE brand_id=$1 AND stage='generating' AND updated_at<$2",[brandId,new Date(adapters.now().getTime()-20*60000)]);
        const daySlots = dailySlots(adapters.now()), sources = await adapters.sources();
        const previous = (await c.query('SELECT source,stage,scheduled_at FROM amc_iaic.daily_publishing_slots WHERE brand_id=$1 ORDER BY scheduled_at DESC LIMIT 200', [brandId])).rows;
        const used = new Set<string>(previous.filter(r => r.source).map(r => sourceFingerprint(r.source)));
        for (const accountId of policy.account_ids) {
            const account = await prisma.socialAccount.findFirst({ where: { id: accountId, brandId, unboundAt: null, platformId: { in: ['instagram', 'facebook'] }, connectionStatus: 'CONNECTED' } });
            const today = new Date(adapters.now().getTime() + 8 * 3600000).toISOString().slice(0, 10);
            if (!account) {
                await dailyNotice(policy.owner_id, brandId, accountId, 'failure', today, '日更账号不可用或已解绑，请检查连接。');
                continue;
            }
            for (const slot of daySlots) {
                if (attempted >= maxCreates)
                    break;
                const occupied = await prisma.contentDraft.findFirst({ where: { brandId, accountId, status: { in: ['scheduled', 'publishing', 'published'] }, scheduledAt: { gte: new Date(slot.at.getTime() - 18.5 * 3600000), lt: new Date(slot.at.getTime() + 5.5 * 3600000) } } });
                if (occupied)
                    continue;
                const id = 'daily_' + mediaDigest([brandId, accountId, slot.day]).slice(0, 40);
                const old = (await c.query('SELECT * FROM amc_iaic.daily_publishing_slots WHERE id=$1', [id])).rows[0];
                // Never repeat a provider call whose outcome is uncertain or silently replace edited/deleted content.
                if (old) {
                    if (old.stage === 'generating' && new Date(old.updated_at).getTime() < adapters.now().getTime() - 20 * 60000)
                        await c.query("UPDATE amc_iaic.daily_publishing_slots SET stage='needs_attention',error='interrupted_generation_requires_reconciliation',updated_at=now() WHERE id=$1 AND stage='generating'", [id]);
                    continue;
                }
                const source = pickSource(sources, used, previous.length + attempted);
                if (!source)
                    break;
                if (!await adapters.validate(source))
                    continue;
                const inserted = await c.query(`INSERT INTO amc_iaic.daily_publishing_slots(id,brand_id,account_id,local_day,scheduled_at,policy_revision,stage,source) VALUES($1,$2,$3,$4,$5,$6,'generating',$7) ON CONFLICT DO NOTHING RETURNING id`, [id, brandId, accountId, slot.day, slot.at, policy.revision, JSON.stringify(source)]);
                if (!inserted.rowCount)
                    continue;
                used.add(sourceFingerprint(source));
                attempted++;
                try {
                    const generated = await adapters.compose({ id, brandId, ownerId: policy.owner_id, platform: account.platformId, source });
                    const fresh = (await c.query('SELECT * FROM amc_iaic.daily_publishing_policy WHERE brand_id=$1', [brandId])).rows[0];
                    if (!fresh?.enabled || fresh.revision !== policy.revision || !await adapters.validate(source))
                        throw Error('daily_policy_or_source_changed');
                    await dailyAccess(policy.owner_id, brandId, true);
                    await prisma.$transaction(async (tx: any) => {
                        await tx.$queryRaw `SELECT id FROM "SocialAccount" WHERE id=${accountId} AND "unboundAt" IS NULL FOR UPDATE`;
                        const bound = await tx.socialAccount.findFirst({ where: { id: accountId, brandId, unboundAt: null } });
                        if (!bound)
                            throw Error('daily_account_changed');
                        const asset = await tx.mediaAsset.create({ data: { id: id + '_asset', brandId, filename: generated.title.slice(0, 80) + '.' + (generated.mimeType === 'image/png' ? 'png' : 'jpg'), url: generated.mediaUrl, mimeType: generated.mimeType, sourceType: 'daily_publishing', materialClass: source.kind === 'asset' ? 'UNCONFIRMED' : 'AI', aiReady: true, aiCaption: generated.title, aiTags: ['AMC daily publishing', source.kind], rightsStatus: source.kind === 'asset' ? (source.rights || null) : 'owned', ...(generated.bytes ? { sizeBytes: generated.bytes, width: 1080, height: 1350, technicalMetadata: { kind: "image", mimeType: generated.mimeType, sizeBytes: generated.bytes, width: 1080, height: 1350, format: "png" } } : {}) } });
                        await tx.contentDraft.create({ data: { id, brandId, accountId, caption: generated.caption, hashtags: generated.hashtags || [], mediaUrls: [generated.mediaUrl], status: 'draft', captionLang: 'en', scheduledAt: slot.at, agentNote: 'AMC日更储备：需要审核正文、来源使用权及精确排期。', viralCopyScriptProvenance: { dailyPublishing: { slotId: id, source, policyRevision: policy.revision, requiresRightsReview: source.kind === 'asset' } }, assetRefs: { create: { assetId: asset.id, order: 0 } } } });
                    });
                    await c.query("UPDATE amc_iaic.daily_publishing_slots SET stage='awaiting_review',draft_id=$2,updated_at=now() WHERE id=$1", [id, id]);
                    created++;
                }
                catch {
                    await c.query("UPDATE amc_iaic.daily_publishing_slots SET stage='needs_attention',error='generation_or_persistence_requires_reconciliation',updated_at=now() WHERE id=$1", [id]);
                    await dailyNotice(policy.owner_id, brandId, accountId, 'failure', today, '日更内容制作未完成或回执待核对；已保留原记录，不会自动重复制作。');
                }
            }
            const drafts = await prisma.contentDraft.findMany({ where: { brandId, accountId, OR: [{ scheduledAt: { gte: new Date(adapters.now().getTime() - 7 * 86400000) } }, { deliveryFailureAt: { gte: new Date(adapters.now().getTime() - 86400000) } }] } });
            const stock = inventory(daySlots, drafts, adapters.now());
            if (stock.missingDays.length)
                await dailyNotice(policy.owner_id, brandId, accountId, 'shortage', today, `账号 ${account.handle} 未来7天有 ${stock.missingDays.length} 天尚无已批准排期：${stock.missingDays.join('、')}。草稿已准备的请审核；缺少素材或制作异常请查看储备页。`);
            if (stock.overdue)
                await dailyNotice(policy.owner_id, brandId, accountId, 'overdue', today, `账号 ${account.handle} 有 ${stock.overdue} 条排期已过1小时但尚未确认发布，请检查投递队列和平台结果。`);
            const unfinished = (await c.query("SELECT id FROM amc_iaic.daily_publishing_slots WHERE brand_id=$1 AND account_id=$2 AND stage='needs_attention' AND scheduled_at>now()-interval '1 day'", [brandId, accountId])).rows;
            if (unfinished.length)
                await dailyNotice(policy.owner_id, brandId, accountId, 'failure', today, '日更储备制作记录需要核对，请打开储备页处理；不会自动重试未知制作。');
            if (stock.failed)
                await dailyNotice(policy.owner_id, brandId, accountId, 'failure', today, `账号 ${account.handle} 有 ${stock.failed} 条失败或结果未知的投递，请核对原记录，勿直接重发。`);
        }
        return { attempted, created, sourceCandidates: sources.length };
    }
    finally {
        if (locked)
            await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['daily-refill:' + brandId]);
        c.release();
    }
}
export function startDailyPublishingWorker() {
    const state = globalThis as typeof globalThis & {
        amcDailyPublishingStarted?: boolean;
    };
    if (state.amcDailyPublishingStarted)
        return;
    state.amcDailyPublishingStarted = true;
    let busy = false, stopped = false;
    const run = async () => { if (busy || stopped)
        return; busy = true; try {
        await refillDaily();
    }
    catch {
        console.warn('[daily-publishing] refill requires attention');
        try {
            const pool = await dailyDb(), p = (await pool.query('SELECT owner_id FROM amc_iaic.daily_publishing_policy WHERE brand_id=$1 AND enabled=true', [AMC_BRAND_ID])).rows[0];
            if (p)
                await dailyNotice(p.owner_id, AMC_BRAND_ID, 'all', 'failure', new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), '日更储备检查未完成，请检查内容服务、权限及来源。');
        }
        catch { }
    }
    finally {
        busy = false;
    } };
    const timer = setInterval(() => void run(), 5 * 60000);
    timer.unref();
    void run();
    process.once('SIGTERM', () => { stopped = true; clearInterval(timer); });
}
