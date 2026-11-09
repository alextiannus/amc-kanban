'use client'
import {use,useEffect,useState} from 'react'
export default function VideoConfirmation({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState<any>(null)
 const endpoint='/api/video-assistant/confirm/'+encodeURIComponent(id)
 useEffect(()=>{let active=true;fetch(endpoint,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'暂时无法读取，请稍后重试。');if(active){setData(d);if(d.execution)setResult(d.execution)}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[endpoint])
 async function confirm(){setBusy(true);setError('');try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true})});const d=await r.json();if(!r.ok)throw Error(d.error||'请稍后重试。');setResult(d)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="mx-auto max-w-2xl p-6 text-slate-900"><p className="text-sm text-slate-500">AMC · 视频制作</p><h1 className="mt-3 text-2xl font-semibold">{data?.kind==='final'?'审核视频成片':'确认视频制作'}</h1>
 {error&&<p role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
 {!data&&!error&&<p role="status" className="my-6">正在读取当前制作内容…</p>}
 {data&&<><h2 className="mt-6 text-lg font-medium">{data.project.title}</h2><p className="mt-2 text-sm text-slate-600">请核对品牌事实、素材使用权和以下内容。修改后需要重新确认。</p>
 {data.project.brief&&<p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4">{data.project.brief}</p>}
 <div className="my-4 grid grid-cols-2 gap-3">{data.project.assets.map((a:any)=><figure key={a.id} className="min-w-0 rounded-xl border p-2">{a.url&&(a.mimeType?.startsWith('video/')?<video className="max-h-48 w-full" controls playsInline preload="metadata" src={a.url}/>:a.mimeType?.startsWith('image/')?<img className="h-32 w-full object-contain" alt={a.filename} src={a.url}/>:null)}<figcaption className="mt-2 break-words text-xs">{a.filename}</figcaption></figure>)}</div>
 <ol className="my-5 space-y-3">{data.project.shots.map((s:any,i:number)=><li key={s.shotId} className="rounded-xl border border-slate-200 p-4"><p className="text-sm text-slate-500">镜头 {i+1} · {s.durationSec} 秒</p><p className="mt-2 whitespace-pre-wrap">{s.prompt}</p>{s.spokenText&&<p className="mt-2 whitespace-pre-wrap">旁白：{s.spokenText}</p>}{s.subtitle&&<p className="mt-2">字幕：{s.subtitle}</p>}</li>)}</ol>
 {data.previews.map((v:any)=><video key={v.id} className="my-4 max-h-[65vh] w-full rounded-xl bg-black" controls playsInline preload="metadata" src={v.url}/>)}
 {data.estimate&&<div className="my-4 rounded-xl bg-slate-50 p-4"><p>预计制作成本：{data.estimate.estimatedAmount} {data.estimate.currency}</p><p className="mt-1 text-sm text-slate-600">本次生成使用 {data.estimate.amcCredit.amount} AMC Credit；按现有账单规则结算。</p></div>}
 {!result?<><p className="mb-3 text-sm text-slate-500">确认有效至 {new Date(data.expiresAt).toLocaleString('zh-SG',{timeZone:'Asia/Singapore'})}（新加坡时间）。</p><button type="button" disabled={busy} onClick={confirm} className="min-h-12 w-full rounded-xl bg-slate-900 px-5 py-3 text-white disabled:opacity-50">{busy?'正在提交，请勿重复操作…':data.kind==='final'?'确认成片并保存到素材库':'确认当前内容与费用，开始制作'}</button></>:<p role="status" className="rounded-xl bg-slate-50 p-4">{result.state==='submitted'?'已提交制作。可以返回原对话查看进度。':result.state==='approved'?'成片已确认。可以返回原对话下载。':result.state==='failed'?'本次操作未完成，请返回原对话核对并重新确认。':'制作回执待核对。请返回原对话读取原任务，勿重复提交。'}</p>}
 </>}
 </main>
}
