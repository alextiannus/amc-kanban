import { prisma } from '../prisma';
import { mediaDigest } from '../video-assistant/post-contract';
import { deniedRights, AMC_BRAND_ID } from './policy';
export function dailySourceRevision(kind:string,row:any){return mediaDigest(kind==='academy'?[row.title,row.markdown,row.desc]:kind==='published'?[row.caption,row.postUrl]:[row.url,row.contentHash,row.mimeType,row.aiCaption,row.aiTags,row.rightsStatus,row.aiReady])}
export type DailySource = {
    kind: 'academy' | 'published' | 'asset';
    id: string;
    revision: string;
    title: string;
    text: string;
    brandId?: string;
    url?: string;
    mimeType?: string;
    rights?: string | null;
};
export async function dailySources(db: any = prisma): Promise<DailySource[]> {
    const [articles, posts, assets] = await Promise.all([
        db.schoolItem.findMany({ where: { type: { in: ['ARTICLE', 'COURSE', 'CASE'] } }, orderBy: { updatedAt: 'desc' }, take: 200 }),
        db.contentDraft.findMany({ where: { status: 'published', postUrl: { not: null }, publishedAt: { not: null } }, orderBy: { publishedAt: 'desc' }, take: 300, select: { id: true, brandId: true, caption: true, postUrl: true, updatedAt: true } }),
        db.mediaAsset.findMany({ where: { aiReady: true, mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] }, NOT: { brandId: AMC_BRAND_ID, sourceType: 'daily_publishing' } }, orderBy: { updatedAt: 'desc' }, take: 500, select: { id: true, brandId: true, filename: true, aiCaption: true, aiTags: true, aiReady:true, url: true, mimeType: true, rightsStatus: true, contentHash:true, updatedAt: true } })
    ]);
    return [
        ...articles.filter((a: any) => a.markdown || a.desc).map((a: any) => ({ kind: 'academy' as const, id: a.id, revision: dailySourceRevision('academy',a), title: a.title || 'AMC Academy', text: String(a.markdown || a.desc).slice(0, 10000) })),
        ...posts.filter((p: any) => /^https:\/\//.test(p.postUrl || '') && p.caption?.trim()).map((p: any) => ({ kind: 'published' as const, id: p.id, brandId: p.brandId, revision: dailySourceRevision('published',p), title: 'Published marketing example', text: p.caption.slice(0, 7000) })),
        ...assets.filter((a: any) => !deniedRights(a.rightsStatus) && /^https:\/\//.test(a.url) && a.aiCaption?.trim()).map((a: any) => ({ kind: 'asset' as const, id: a.id, brandId: a.brandId, revision: dailySourceRevision('asset',a), title: a.filename, text: [a.aiCaption, ...a.aiTags].join('\n').slice(0, 6000), url: a.url, mimeType: a.mimeType, rights: a.rightsStatus }))
    ];
}
export async function validateDailySource(source: DailySource, db: any = prisma) {
    let current: any;
    if (source.kind === 'asset') {
        current = await db.mediaAsset.findUnique({ where: { id: source.id } });
        return !!current && current.aiReady && !deniedRights(current.rightsStatus) && source.revision === dailySourceRevision('asset',current);
    }
    if (source.kind === 'academy') {
        current = await db.schoolItem.findUnique({ where: { id: source.id } });
        return !!current && ['ARTICLE', 'COURSE', 'CASE'].includes(current.type) && source.revision === dailySourceRevision('academy',current);
    }
    current = await db.contentDraft.findUnique({ where: { id: source.id } });
    return !!current && current.status === 'published' && current.publishedAt && /^https:\/\//.test(current.postUrl || '') && source.revision === dailySourceRevision('published',current);
}
export async function validateDailyDraft(draft: any, db: any = prisma) {
    const p = draft.viralCopyScriptProvenance?.dailyPublishing;
    if (!p)
        return true;
    if (draft.brandId !== AMC_BRAND_ID || !p.source || !await validateDailySource(p.source, db))
        return false;
    const rows = await db.$queryRaw `SELECT enabled,account_ids,revision,owner_id FROM amc_iaic.daily_publishing_policy WHERE brand_id=${draft.brandId}`;
    const policy = rows[0];
    if (!policy?.enabled || policy.revision !== p.policyRevision || !policy.account_ids.includes(draft.accountId))
        return false;
    const owner = await db.user.findUnique({where:{id:policy.owner_id},include:{businessRoles:true}});
    if(!owner||owner.status!=='ACTIVE'||owner.type!=='HUMAN'||(owner.role!=='ADMIN'&&!owner.businessRoles.some((r:any)=>r.role==='ADMIN')))return false;
    if(!await db.crewMember.findFirst({where:{userId:policy.owner_id,active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId:draft.brandId,brand:{status:'ACTIVE'}}}}))return false;
    return true;
}
