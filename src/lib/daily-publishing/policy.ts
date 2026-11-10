import { mediaDigest } from '../video-assistant/post-contract';
export const AMC_BRAND_ID = 'cmpw2kbcb0009jr29r63q12oy';
export const RESERVE_DAYS = 7;
export const deniedRights = (value: unknown) => ['denied', 'expired', 'revoked', 'restricted'].includes(String(value || '').toLowerCase());
export const sourceFingerprint = (s: {
    kind: string;
    id: string;
    revision: string;
}) => mediaDigest([s.kind, s.id, s.revision]);
export function dailySlots(now = new Date()) {
    const local = new Date(now.getTime() + 8 * 3600000);
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return Array.from({ length: 8 }, (_, i) => new Date(midnight + i * 86400000 + (18.5 - 8) * 3600000)).filter(d => d.getTime() > now.getTime() + 30 * 60000).slice(0, RESERVE_DAYS).map(at => ({ day: new Date(at.getTime() + 8 * 3600000).toISOString().slice(0, 10), at }));
}
export function pickSource<T extends {
    kind: string;
    id: string;
    revision: string;
}>(sources: T[], used: Set<string>, index: number): T | undefined {
    const kinds = ['academy', 'published', 'asset'];
    for (let i = 0; i < 3; i++) {
        const kind = kinds[(index + i) % 3], candidate = sources.find(s => s.kind === kind && !used.has(sourceFingerprint(s)));
        if (candidate)
            return candidate;
    }
}
export function inventory(slots: Array<{
    day: string;
}>, drafts: Array<{
    status: string;
    scheduledAt: Date | null;
    platformPostId?: string | null;
    publishedAt?: Date | null;
    deliveryFailureCode?: string | null;
}>, now = new Date()) {
    const day = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const approved = new Set(drafts.filter(d => !d.deliveryFailureCode && d.scheduledAt && d.scheduledAt > now && ((d.status === 'scheduled' && d.platformPostId) || d.status === 'publishing')).map(d => day(d.scheduledAt!)));
    return { overdue: drafts.filter(d => d.scheduledAt && d.scheduledAt.getTime() < now.getTime() - 3600000 && ['scheduled', 'publishing'].includes(d.status)).length, approvedDays: slots.filter(s => approved.has(s.day)).map(s => s.day), missingDays: slots.filter(s => !approved.has(s.day)).map(s => s.day), failed: drafts.filter(d => d.status === 'failed' || !!d.deliveryFailureCode).length };
}
