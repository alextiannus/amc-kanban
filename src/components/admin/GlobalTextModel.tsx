'use client'
import { useEffect, useState } from 'react'
type Connection={id:string;displayName:string;provider:string;modelName:string}
export default function GlobalTextModel({connections}:{connections:Connection[]}){
  const [data,setData]=useState<any>(null),[connectionId,setConnectionId]=useState(''),[report,setReport]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function load(){const r=await fetch('/api/admin/global-text',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d)}
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  async function action(kind:string,enabled=true){setBusy(true);setError('');try{
    const r=await fetch('/api/admin/global-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,connectionId,enabled,expectedVersion:data?.current.version,validationId:report?.id})});const d=await r.json();if(!r.ok)throw new Error(d.error)
    if(kind==='test'||kind==='preflight')setReport(d);else setReport(null)
    await load()
  }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
  const selected=connections.find(c=>c.id===data?.current.connectionId)
  const previous=data?.revisions?.[1]
  const latestValidation=data?.validations?.find((v:any)=>v.connectionId===data?.current.connectionId)
  return <section className="rounded-2xl border border-indigo-200 p-5 space-y-3 bg-white dark:bg-slate-900">
    <h3 className="font-bold">全局文本模型 · Kanban / Content / MM</h3>
    <p className="text-xs">当前连接最近预检：{['kanban','content','mm'].map(system=>`${system}: ${latestValidation?.report?.systems?.[system]?'通过':'未验证'}`).join(' · ')}</p>
    <p className="text-sm">{data?.current.enabled?`严格统一：${selected?.displayName||data.current.connectionId} / ${selected?.modelName||''}`:'全局策略关闭，沿用各系统原路由'} · 版本 {data?.current.version??'—'}</p>
    <p className="text-xs text-slate-500">纯文本及工具调用统一选择，失败不切换供应商。图片、视频和音频仍使用各自模型。新连接请使用下方“添加模型路由”；厂商协议与显示名称可分别设置。</p>
    <select aria-label="全局文本连接" value={connectionId} disabled={busy} onChange={e=>{setConnectionId(e.target.value);setReport(null)}} className="border rounded p-2 text-sm bg-transparent w-full">
      <option value="">请选择连接</option>{connections.filter(c=>['kopix','openai','custom_shim','deepseek','anthropic','google','minimax'].includes(c.provider)).map(c=><option key={c.id} value={c.id}>{c.displayName} · {c.provider} · {c.modelName}</option>)}
    </select>
    <div className="flex flex-wrap gap-3 text-sm">
      <button disabled={busy||!connectionId} onClick={()=>action('test')}>测试连接及能力</button>
      <button disabled={busy||!connectionId} onClick={()=>action('preflight')}>预检三个系统</button>
      <button disabled={busy||!report?.passed||report.connectionId!==connectionId} onClick={()=>action('apply')}>应用全局切换</button>
      <button disabled={busy||!data?.current.enabled} onClick={()=>action('apply',false)}>关闭严格策略</button>
      <button disabled={busy||!previous?.connectionId} onClick={()=>{setConnectionId(previous.connectionId);setReport(null)}}>选择上一版连接并重新预检</button>
    </div>
    {busy&&<p role="status">正在验证，请稍候；当前路由保持不变。</p>}
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {report&&<div className="text-sm"><p>验证结果：{report.passed?'全部通过，可应用':'尚未通过全部预检'}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify({checks:report.checks,systems:report.systems,errors:report.errors},null,2)}</pre></div>}
    <details><summary className="text-sm cursor-pointer">最近调用与验证记录</summary><pre className="overflow-auto text-xs max-h-72">{JSON.stringify({validations:data?.validations,calls:data?.calls},null,2)}</pre></details>
  </section>
}
