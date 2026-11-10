import { authenticateRequest } from '@/lib/auth-v2';
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin';
import { dailyAccess, dailyStatus, configureDaily, refillDaily } from '@/lib/daily-publishing/service';
import { approveDaily } from '@/lib/daily-publishing/approval';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'cache-control': 'no-store' };
type Context = {
    params: Promise<{
        id: string;
    }>;
};
async function run(request: Request, { params }: Context) {
    try {
        const p = await authenticateRequest(request);
        if (!p)
            return Response.json({ error: '请登录 AMC。' }, { status: 401, headers });
        const { id } = await params;
        await dailyAccess(p.userId, id, request.method === 'POST');
        if (request.method === 'GET')
            return Response.json(await dailyStatus(p.userId, id), { headers });
        if (!request.headers.get('origin') || !allowedRoleWriteOrigin(request) || request.headers.get('sec-fetch-site') === 'cross-site')
            return Response.json({ error: 'Forbidden' }, { status: 403, headers });
        const raw = await request.text();
        if (raw.length > 12000)
            return Response.json({ error: 'payload_too_large' }, { status: 413, headers });
        let b: any;
        try {
            b = JSON.parse(raw);
        }
        catch {
            return Response.json({ error: 'invalid_json' }, { status: 400, headers });
        }
        if (b.action === 'configure')
            return Response.json(await configureDaily(p.userId, id, b), { headers });
        if (b.action === 'refill')
            return Response.json(await refillDaily(id), { headers });
        if (b.action === 'approve') {
            if (p.source !== 'session' || request.headers.has('authorization') || request.headers.has('x-api-key'))
                return Response.json({ error: '请在登录后的页面审核。' }, { status: 403, headers });
            return Response.json(await approveDaily(p.userId, id, b), { headers });
        }
        return Response.json({ error: 'invalid_action' }, { status: 400, headers });
    }
    catch (e) {
        const status = (e as any)?.status || 503;
        return Response.json({ error: status === 503 ? '日更服务暂不可用，请保留原记录。' : (e as Error).message }, { status, headers });
    }
}
export const GET = run;
export const POST = run;
