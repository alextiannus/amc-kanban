'use client'
import { useEffect, useState } from 'react'
const labels:Record<string,string>={text:'纯文本',image_understanding:'图片理解',video_understanding:'视频理解',image_generation:'图片生成',video_generation:'视频生成',speech_recognition:'语音识别',speech_synthesis:'语音合成',music:'音乐'}
const initialSelection={defaults:{},exceptions:{}}
export default function UnifiedModelManagement({onActive}:{onActive:(active:boolean)=>void}){
  const [data,setData]=useState<any>(),[selection,setSelection]=useState<any>(initialSelection),[report,setReport]=useState<any>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [connection,setConnection]=useState({name:'',protocol:'openai',baseUrl:'',secret:'',previousId:''})
  const [model,setModel]=useState({connectionId:'',name:'',modelName:'',capabilities:['text'],inputCapabilities:'text_input,structured_json',parameters:'{"timeoutMs":120000,"maxRetries":0,"maxTokensByTask":{}}'})
  const [exceptionTask,setExceptionTask]=useState('content:video_generation'),[exceptionModel,setExceptionModel]=useState('')
  async function load(){const response=await fetch('/api/admin/models',{cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result);onActive(result.current.active);return result}
  useEffect(()=>{load().then(d=>setSelection(d.current.selection||initialSelection)).catch(e=>setError(e.message))},[])
  function choose(next:any){setSelection(next);setReport(undefined)}
  async function action(action:string,extra:any={}){
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/admin/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})})
      const result=await response.json();if(!response.ok)throw new Error(result.error)
      if(action==='import'){choose(result.selection);setReport(result)}
      if(action==='validate')setReport(result)
      if(action==='publish'){setReport(undefined)}
      if(action==='connection')setConnection({...connection,secret:''})
      await load()
    }catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}
  }
  const inputClass='border rounded p-2 bg-transparent w-full text-sm'
  return <section className="space-y-5 rounded-2xl border border-indigo-200 bg-white dark:bg-slate-900 p-5">
    <header><h2 className="font-bold text-lg">统一模型管理 · Kanban / Content / MM</h2><p className="text-sm">{data?.current.active?`当前统一版本 ${data.current.version}`:'迁移准备中，尚未发布统一配置'}。文本一个默认模型；媒体可设置任务例外。</p></header>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    <div className="grid md:grid-cols-3 gap-2 text-sm">{['kanban','content','mm'].map(system=>{
      const validation=data?.validations?.[0]
      const call=data?.calls?.find((c:any)=>c.source===system&&c.version===data?.current.version)
      return <div key={system} className="rounded border p-2"><strong>{system.toUpperCase()}</strong><p>最近预检：{validation?validation.report.checks?.[`system.${system}`]?'通过':'未通过':'尚未预检'}</p><p>当前版本调用：{call?`${call.targetModel} · ${call.status}`:'尚无记录'}</p></div>
    })}</div>
    <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">1. 供应商连接</legend>
      <div className="grid md:grid-cols-2 gap-2">
        <input className={inputClass} placeholder="供应商名称，例如 Kopix" value={connection.name} onChange={e=>setConnection({...connection,name:e.target.value})}/>
        <select aria-label="接口协议" className={inputClass} value={connection.protocol} onChange={e=>setConnection({...connection,protocol:e.target.value})}>{['openai','anthropic','google','custom_shim','deepseek','kopix','minimax','cn_gateway','seedance','volcengine','fal','kieai','baidu_seedance'].map(p=><option key={p}>{p}</option>)}</select>
        <input className={inputClass} placeholder="接口地址（包含协议所需路径）" value={connection.baseUrl} onChange={e=>setConnection({...connection,baseUrl:e.target.value})}/>
        <input className={inputClass} type="password" autoComplete="new-password" placeholder="密钥（加密保存）" value={connection.secret} onChange={e=>setConnection({...connection,secret:e.target.value})}/>
      </div>
      <button type="button" onClick={()=>action('connection',{connection})}>保存新连接版本</button>
      <p className="text-xs text-slate-500">已保存版本不可改写；轮换密钥请在下方选“新建版本”，再把模型关联到新连接。</p>
      <ul className="text-sm space-y-1">{data?.connections.map((c:any)=><li key={c.id}>{c.name} · {c.protocol} · {c.baseUrl} · 密钥已保存 <button onClick={()=>setConnection({name:c.name,protocol:c.protocol,baseUrl:c.baseUrl,secret:'',previousId:c.id})}>新建版本</button></li>)}</ul>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">2. 模型目录</legend>
      <select className={inputClass} aria-label="模型连接" value={model.connectionId} onChange={e=>setModel({...model,connectionId:e.target.value})}><option value="">选择连接</option>{data?.connections.map((c:any)=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select>
      <div className="grid md:grid-cols-2 gap-2"><input className={inputClass} placeholder="显示名称" value={model.name} onChange={e=>setModel({...model,name:e.target.value})}/><input className={inputClass} placeholder="模型 ID，例如 glm-5.3" value={model.modelName} onChange={e=>setModel({...model,modelName:e.target.value})}/></div>
      <div className="flex flex-wrap gap-3">{Object.entries(labels).map(([id,label])=><label key={id} className="text-sm"><input type="checkbox" checked={model.capabilities.includes(id)} onChange={e=>setModel({...model,capabilities:e.target.checked?[...model.capabilities,id]:model.capabilities.filter(c=>c!==id)})}/>{label}</label>)}</div>
      <label className="block text-sm">协议能力（逗号分隔，例如 text_input,image_input,structured_json）<input className={inputClass} value={model.inputCapabilities} onChange={e=>setModel({...model,inputCapabilities:e.target.value})}/></label>
      <label className="block text-sm">参数限制 JSON：超时、重试、输出额度、videoConstraints<textarea className={inputClass} rows={3} value={model.parameters} onChange={e=>setModel({...model,parameters:e.target.value})}/></label>
      <button onClick={()=>{try{action('model',{model:{connectionId:model.connectionId,definition:{...JSON.parse(model.parameters),name:model.name,modelName:model.modelName,capabilities:model.capabilities,inputCapabilities:model.inputCapabilities.split(',').map(s=>s.trim()).filter(Boolean)}}})}catch{setError('模型参数必须为有效 JSON')}}}>保存模型版本</button>
      <ul className="text-sm">{data?.models.map((m:any)=><li key={m.id}>{m.definition.name} · {m.definition.modelName} · {m.definition.capabilities.map((c:string)=>labels[c]).join('、')}</li>)}</ul>
    </fieldset>
    <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">3. 使用配置</legend>
      <button onClick={()=>action('import')}>盘点并导入三系统旧配置</button>
      <div className="grid md:grid-cols-2 gap-3">{Object.entries(labels).map(([cap,label])=><label key={cap} className="text-sm">{label}<select className={inputClass} value={selection.defaults[cap]||''} onChange={e=>{const defaults={...selection.defaults};if(e.target.value)defaults[cap]=e.target.value;else delete defaults[cap];choose({...selection,defaults})}}><option value="">未配置（调用时明确报错）</option>{data?.models.filter((m:any)=>m.definition.capabilities.includes(cap)).map((m:any)=><option key={m.id} value={m.id}>{m.definition.name} · {m.definition.modelName}</option>)}</select></label>)}</div>
      <div className="grid md:grid-cols-2 gap-2"><input className={inputClass} aria-label="媒体任务例外" value={exceptionTask} onChange={e=>setExceptionTask(e.target.value)} placeholder="content:video_generation 或 content:task:platform"/><select className={inputClass} value={exceptionModel} onChange={e=>setExceptionModel(e.target.value)}><option value="">选择例外模型</option>{data?.models.filter((m:any)=>m.definition.capabilities.some((c:string)=>c!=='text')).map((m:any)=><option key={m.id} value={m.id}>{m.definition.name}</option>)}</select></div>
      <button disabled={!exceptionModel||busy} onClick={()=>choose({...selection,exceptions:{...selection.exceptions,[exceptionTask]:exceptionModel}})}>设置媒体例外</button>
      <ul className="text-sm">{Object.entries(selection.exceptions).map(([task,id])=><li key={task}>{task} → {data?.models.find((m:any)=>m.id===id)?.definition.name||String(id)} <button onClick={()=>{const exceptions={...selection.exceptions};delete exceptions[task];choose({...selection,exceptions})}}>移除</button></li>)}</ul>
      <div className="flex flex-wrap gap-4"><button onClick={()=>action('validate',{selection})}>测试模型并预检三系统</button><button disabled={busy||!report?.passed} onClick={()=>action('publish',{selection,validationId:report.id,expectedVersion:data?.current.version??null})}>发布统一配置</button><select aria-label="回滚历史版本" onChange={e=>{const r=data.revisions.find((r:any)=>r.version===Number(e.target.value));if(r)choose(r.configuration)}} value=""><option value="">选择历史版本重新预检并发布</option>{data?.revisions.map((r:any)=><option key={r.version} value={r.version}>版本 {r.version}</option>)}</select></div>
    </fieldset>
    {busy&&<p role="status">正在处理，请稍候……</p>}
    {report&&<pre className="text-xs overflow-auto max-h-80">{JSON.stringify(report,null,2)}</pre>}
    <details><summary>三个系统最近调用记录</summary><pre className="text-xs overflow-auto max-h-80">{JSON.stringify(data?.calls,null,2)}</pre></details>
  </section>
}
