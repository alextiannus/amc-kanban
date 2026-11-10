'use client';
import { useEffect, useState } from 'react';
const BRAND = 'cmpw2kbcb0009jr29r63q12oy';
export default function DailyPublishing() {
    const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(''), [rights, setRights] = useState<Record<string, boolean>>({});
    const endpoint = `/api/brands/${BRAND}/daily-publishing`;
    async function load() { try {
        const r = await fetch(endpoint, { cache: 'no-store' }), d = await r.json();
        if (!r.ok)
            throw Error(d.error);
        setData(d);
    }
    catch (e) {
        setError((e as Error).message);
    } }
    useEffect(() => { void load(); const t = setInterval(() => void load(), 60000); return () => clearInterval(t); }, []);
    async function action(body: any) { setBusy(body.draftId || body.action); setError(''); try {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json();
        if (!r.ok || d.result?.ok === false)
            throw Error(d.error || d.result?.error || '提交未完成，请核对原记录。');
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    const date = (s: string) => new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Singapore', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return <main style={{ maxWidth: 1000, margin: 'auto', padding: 24, color: '#282718', background: '#fffdf6', minHeight: '100vh' }}><a href="/dashboard">返回工作台</a><h1>AI Marketing Crew · 日更储备</h1><p>每个账号每天一篇，提前准备7天。新内容审核后进入自动排期；排队或已排期不等于发布成功。时间均为新加坡时间。</p>{error && <p role="alert">{error}</p>}{!data ? <p>正在读取内容储备…</p> : <><p>日更流程：{data.policy?.enabled ? '已启用' : '未启用'}</p>{data.inventory.map((a: any) => <p key={a.accountId}>{data.accounts.find((x: any) => x.id === a.accountId)?.displayName}：未来7天已有 {a.approvedDays.length} 天批准排期，缺少 {a.missingDays.length} 天。</p>)}<button disabled={!!busy || !data.policy?.enabled} onClick={() => void action({ action: 'refill' })}>补充待审核内容</button><p>每篇请核实正文、媒体和来源使用权。修改草稿后需要重新审核；过期排期不会自动顺延。</p>{data.slots.map((s: any) => { const d = data.drafts.find((x: any) => x.id === s.draft_id); return <article key={s.id} style={{ padding: 20, border: '1px solid #ddcc99', borderRadius: 12, margin: '20px 0' }}><h2>{date(s.scheduled_at)} · {data.accounts.find((a: any) => a.id === s.account_id)?.displayName || '账号不可用'}</h2><p>状态：{d?.status === 'published' ? '已发布' : d?.status === 'scheduled' ? '已排期' : d?.status === 'publishing' ? '投递中' : s.stage === 'awaiting_review' ? '待审核' : s.stage === 'needs_attention' ? '需要处理' : s.stage}</p><p>来源：{s.source?.kind === 'academy' ? 'AMC学院' : s.source?.kind === 'published' ? '已发布内容再创作' : 'AMC素材库'} · {s.source?.title}</p>{s.source && <details><summary>查看选材依据</summary><p style={{ whiteSpace: 'pre-wrap' }}>{s.source.text}</p><small>来源编号 {s.source.id}；版本 {s.source.revision.slice(0, 12)}</small></details>}{d?.assetRefs?.map((r: any) => r.asset?.mimeType?.startsWith('image/') ? <img key={r.assetId} src={r.asset.url} alt={r.asset.filename} style={{ maxWidth: 320, width: '100%', height: 'auto' }}/> : null)}{d && <><p style={{ whiteSpace: 'pre-wrap' }}>{d.caption}</p><p>{d.hashtags.map((h: string) => '#' + h).join(' ')}</p>{d.postUrl && <a href={d.postUrl} target="_blank" rel="noreferrer">查看平台帖子</a>}{['draft', 'pending_review'].includes(d.status) && new Date(s.scheduled_at).getTime() > Date.now() + 5 * 60000 && <><label style={{ display: 'block', margin: '12px 0' }}><input type="checkbox" checked={!!rights[d.id]} onChange={e => setRights({ ...rights, [d.id]: e.target.checked })}/> 我已核实正文、媒体、来源使用权、目标账号及此排期，同意发布。</label><button disabled={!!busy || !rights[d.id]} onClick={() => void action({ action: 'approve', draftId: d.id, revision: d.revision, confirmed: true, rightsConfirmed: true })}>审核通过并排期</button></>}</>}{s.error && <p role="alert">制作结果需要核对，请保留原记录，不要重复制作。</p>}</article>; })}</>}</main>;
}
