'use client'
import { useEffect, useState } from 'react'
import { Sparkles, Plus, Edit3, Loader2, RefreshCw } from 'lucide-react'
import ModelVersionEditor from './ModelVersionEditor'

export const modelCapabilityLabels:Record<string,string>={text:'全局文本',image_understanding:'图片理解',video_understanding:'视频理解',image_generation:'图片生成',video_generation:'视频生成',speech_recognition:'语音识别',speech_synthesis:'语音合成',music:'音乐'}
const empty={defaults:{},exceptions:{}}
const button='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed'
const primary=button+' bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700'
const input='w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm'
export default function UnifiedModelManagement(){
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[report,setReport]=useState<any>(null)
  const [editor,setEditor]=useState<any>(undefined),[exceptionTask,setExceptionTask]=useState('content:video_generation'),[exceptionModel,setExceptionModel]=useState('')
  const selection=data?.draft?.configuration||data?.current?.selection||empty
  async function load(){
    const r=await fetch('/api/admin/models',{cache:'no-store'}),value=await r.json().catch(()=>null)
    if(!r.ok||!value)throw new Error(value?.error||'配置服务不可用，请检查服务部署和数据库迁移')
    setData(value)
  }
  useEffect(()=>{load().catch(e=>setError(e.message))},[])
  async function action(action:string,extra:any={}){
    setBusy(true);setError('');setReport(null)
    try{
      const r=await fetch('/api/admin/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,expectedRevision:data?.draft?.revision||0,...extra})}),value=await r.json().catch(()=>null)
      if(!r.ok||!value)throw new Error(value?.error||'配置操作失败，请检查服务状态')
      setReport(action==='validate'?value:null)
      if(action==='save-model')setEditor(undefined)
      await load();return true
    }catch(e){setError(e instanceof Error?e.message:'操作失败');return false}finally{setBusy(false)}
  }
  const models:any[]=data?.models||[],init=data?.draft?.initializationReport
  const selectedIds=new Set([...Object.values(selection.defaults),...Object.values(selection.exceptions),...Object.values(data?.current?.selection?.defaults||{}),...Object.values(data?.current?.selection?.exceptions||{})])
  const superseded=new Set(models.map(m=>m.definition.previousModelId).filter(Boolean))
  const cards=models.filter(m=>!superseded.has(m.id)||selectedIds.has(m.id))
  const saveSelection=(selection:any)=>action('save-draft',{selection})
  const uses=(s:any,id:string)=>[...Object.entries(s?.defaults||{}).filter(([,v])=>v===id).map(([k])=>modelCapabilityLabels[k]),...Object.entries(s?.exceptions||{}).filter(([,v])=>v===id).map(([k])=>k)].join('、')
  return <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
    <header className="px-6 py-4 flex flex-wrap gap-3 justify-between items-center border-b border-slate-100 dark:border-slate-800"><h2 className="font-black flex items-center gap-2"><Sparkles size={18} className="text-indigo-500"/>统一模型管理</h2><span className="text-xs text-blue-600">Kanban / Content / MM · {cards.length} 个模型</span></header>
    <div className="p-6 space-y-5">
      <p className="text-sm text-slate-500">{data?.current.active?`当前生效版本 v${data.current.version}`:'尚未发布统一配置，业务仍使用原有选择'}。保存资料和选择只更新草稿，发布后新任务才会使用新版本。</p>
      {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}<button className={button+' ml-3'} onClick={()=>{setError('');load().catch(e=>setError(e.message))}}>重新读取</button></div>}
      {!data&&!error&&<p role="status">正在读取模型配置…</p>}
      {data&&<>
        <div className="grid md:grid-cols-3 gap-3">{['kanban','content','mm'].map(system=>{
          const check=(report||data.validations?.[0]?.report)?.checks?.[`system.${system}`],call=data.calls.find((c:any)=>c.source===system&&c.version===data.current.version)
          return <div key={system} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1"><strong>{system.toUpperCase()}</strong><p>最近预检：{check===undefined?'尚未预检':check?'通过':'未通过'}</p><p>当前版本调用：{call?`${call.targetModel} · ${call.status}`:'暂无记录'}</p></div>
        })}</div>
        <fieldset disabled={busy} className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">{!data.current.active&&<button className={button} onClick={()=>action('import')}><RefreshCw size={14}/>{init?'重新检查并初始化':'初始化已有配置'}</button>}<button className={primary} onClick={()=>setEditor(null)}><Plus size={14}/>添加模型</button><span className="text-xs text-slate-500">草稿 r{data.draft?.revision||0}{data.draft?' · 已保存':''}</span></div>
          {init&&<div className={`rounded-xl border p-3 text-sm ${init.complete?'border-emerald-200':'border-amber-300 bg-amber-50 text-amber-900'}`}><strong>{init.complete?'初始化完成':'初始化有待处理项，尚未完成'}</strong><p>已导入 {init.importedModels} 个模型，复用 {init.connections} 个连接。</p><ul className="list-disc pl-5">{init.issues?.map((item:string,i:number)=><li key={i}>{item}</li>)}</ul><p className="text-xs mt-2">处理缺项后重新初始化，相同连接和模型不会重复创建。停用模型只进入目录，不自动参与选择。</p></div>}
          {!!init?.pending?.length&&<details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-semibold">待配置记录（{init.pending.length} 项，不阻塞本次发布）</summary><p className="mt-2">以下未使用的旧模型或未启用的可选任务已排除出本次发布，未创建占位密钥。以后使用前需补齐连接和能力配置，并重新验证发布。</p><ul className="list-disc pl-5 mt-2">{init.pending.map((item:any,i:number)=><li key={i}>{item.kind==='model'?`${item.name||item.legacyId} / ${item.modelName}：缺少密钥或地址，未被媒体路由选择`:`${item.platform} / ${item.task}：可选任务尚未配置`}</li>)}</ul></details>}
          <div className="grid md:grid-cols-2 gap-3">{Object.entries(modelCapabilityLabels).map(([cap,label])=><label key={cap} className="text-xs font-bold space-y-1 block">{label}默认模型<select aria-label={`${label}默认模型`} className={input} value={selection.defaults[cap]||''} onChange={e=>{const defaults={...selection.defaults};if(e.target.value)defaults[cap]=e.target.value;else delete defaults[cap];void saveSelection({...selection,defaults})}}><option value="">未配置</option>{models.filter(m=>m.definition.isEnabled!==false&&m.definition.capabilities.includes(cap)&&(!superseded.has(m.id)||selection.defaults[cap]===m.id)).map(m=><option key={m.id} value={m.id}>{m.definition.name} / {m.definition.modelName}</option>)}</select></label>)}</div>
          <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><summary className="text-sm font-bold cursor-pointer">高级设置：媒体任务例外</summary><p className="text-xs text-slate-500 my-3">媒体优先使用任务例外，再使用能力默认模型。纯文本不能设置例外。</p><div className="flex flex-wrap gap-2"><input aria-label="媒体任务例外" className={input+' flex-1'} value={exceptionTask} onChange={e=>setExceptionTask(e.target.value)}/><select aria-label="例外模型" className={input+' flex-1'} value={exceptionModel} onChange={e=>setExceptionModel(e.target.value)}><option value="">选择媒体模型</option>{models.filter(m=>m.definition.isEnabled!==false&&m.definition.capabilities.some((c:string)=>c!=='text')).map(m=><option key={m.id} value={m.id}>{m.definition.name}</option>)}</select><button className={button} disabled={!exceptionModel} onClick={()=>saveSelection({...selection,exceptions:{...selection.exceptions,[exceptionTask]:exceptionModel}})}>保存例外</button></div><ul className="text-xs mt-3 space-y-2">{Object.entries(selection.exceptions).map(([task,id])=><li key={task} className="flex justify-between gap-2"><span>{task} → {models.find(m=>m.id===id)?.definition.name||String(id)}</span><button onClick={()=>{const exceptions={...selection.exceptions};delete exceptions[task];void saveSelection({...selection,exceptions})}}>移除</button></li>)}</ul></details>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={!data.draft||init?.complete===false||(!data.current.active&&!init?.complete)} onClick={()=>action('validate')}>测试并预检</button><button className={primary} disabled={!report?.passed} onClick={()=>action('publish',{validationId:report.id})}>发布配置</button><select aria-label="恢复历史版本" className={input+' md:w-auto'} value="" onChange={e=>{const r=data.revisions.find((r:any)=>r.version===Number(e.target.value));if(r)void saveSelection(r.configuration)}}><option value="">恢复历史版本到草稿</option>{data.revisions.map((r:any)=><option key={r.version} value={r.version}>版本 v{r.version}</option>)}</select></div>
        </fieldset>
        {report&&<div className="text-sm"><strong>{report.passed?'预检通过，可以发布':'预检未通过，当前生效配置未改变'}</strong><pre className="text-xs mt-2 overflow-auto">{JSON.stringify(report,null,2)}</pre></div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{cards.map(model=>{
          const d=model.definition,c=data.connections.find((c:any)=>c.id===model.connectionId),proof=data.validations.find((v:any)=>v.report.models?.some((m:any)=>m.id===model.id))
          return <article key={model.id} className={`p-4 rounded-xl border flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-950/10 border-slate-200 dark:border-slate-700 ${d.isEnabled===false?'opacity-60':''}`}><div className="flex justify-between gap-2"><div><h3 className="text-sm font-black">{d.name}</h3><p className="text-xs font-mono text-slate-500">{c?.name} / {d.modelName}</p></div><span className="text-xs">{d.isEnabled===false?'停用':superseded.has(model.id)?'历史版本':'可选'}</span></div><div className="text-xs text-slate-500 space-y-1 break-all"><p>协议：{c?.protocol} · 地址：{c?.baseUrl}</p><p>密钥：{c?.maskedSecret||'已保存'}</p><p>能力：{d.capabilities.map((cap:string)=>modelCapabilityLabels[cap]).join('、')}</p><p>验证：{proof?(proof.report.passed?'通过':'未全部通过'):'尚未验证'}</p><p>当前用途：{uses(data.current.selection,model.id)||'未生效'}</p><p>草稿用途：{uses(selection,model.id)||'未选择'}</p></div><button className={button+' self-end'} disabled={busy} onClick={()=>setEditor(model)}><Edit3 size={13}/>编辑模型</button></article>
        })}</div>
        {!cards.length&&<p className="text-center p-8 text-sm text-slate-500 border border-dashed rounded-xl">尚未初始化。点击“初始化已有配置”读取已有模型，无需重新填写密钥。</p>}
        <details><summary className="text-sm cursor-pointer">最近调用记录</summary><pre className="text-xs overflow-auto max-h-72">{JSON.stringify(data.calls,null,2)}</pre></details>
      </>}
      {busy&&<p role="status" className="text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin"/>正在处理，请稍候…</p>}
    </div>
    {editor!==undefined&&<ModelVersionEditor model={editor} connections={data.connections} busy={busy} error={error} onClose={()=>{if(!busy)setEditor(undefined)}} onSave={model=>action('save-model',{model})}/>}
  </section>
}
