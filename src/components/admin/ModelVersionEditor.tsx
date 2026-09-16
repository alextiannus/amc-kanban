'use client'
import { useEffect, useRef, useState } from 'react'
import { modelCapabilityLabels } from './UnifiedModelManagement'

const field='w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm'
const protocols=['openai','anthropic','google','custom_shim','deepseek','kopix','minimax','cn_gateway','seedance','volcengine','fal','kieai','baidu_seedance']
export default function ModelVersionEditor({model,connections,busy,error,onClose,onSave}:{model:any;connections:any[];busy:boolean;error:string;onClose:()=>void;onSave:(model:any)=>Promise<boolean>}){
  const d=model?.definition,oldConnection=connections.find(c=>c.id===model?.connectionId)
  const [mode,setMode]=useState(connections.length?'reuse':'new')
  const [connectionId,setConnectionId]=useState(model?.connectionId||connections[0]?.id||'')
  const [connection,setConnection]=useState({name:oldConnection?.name||'',protocol:oldConnection?.protocol||'openai',baseUrl:oldConnection?.baseUrl||'',secret:''})
  const [name,setName]=useState(d?.name||''),[modelName,setModelName]=useState(d?.modelName||'')
  const [enabled,setEnabled]=useState(d?.isEnabled!==false),[capabilities,setCapabilities]=useState<string[]>(d?.capabilities||['text'])
  const [inputs,setInputs]=useState<string>((d?.inputCapabilities||['text_input','structured_json']).join(', '))
  const [timeout,setTimeoutValue]=useState(d?.timeoutMs||120000),[retries,setRetries]=useState(d?.maxRetries||0)
  const [parameters,setParameters]=useState(JSON.stringify({temperature:d?.temperature,jsonMode:d?.jsonMode,maxTokensByTask:d?.maxTokensByTask||{},videoConstraints:d?.videoConstraints,costMetadata:d?.costMetadata},null,2))
  const [localError,setLocalError]=useState('')
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close()},[])
  async function submit(event:React.FormEvent){
    event.preventDefault();setLocalError('')
    try{
      const extra=JSON.parse(parameters)
      if(!extra||Array.isArray(extra)||typeof extra!=='object')throw new Error('参数必须是 JSON 对象')
      await onSave({previousModelId:model?.id,connectionId:mode==='reuse'?connectionId:undefined,connection:mode==='reuse'?undefined:{...connection,...(mode==='edit'?{previousId:oldConnection.id}:{})},definition:{...extra,name,modelName,isEnabled:enabled,capabilities,inputCapabilities:inputs.split(',').map(s=>s.trim()).filter(Boolean),timeoutMs:Number(timeout),maxRetries:Number(retries)}})
    }catch(e){setLocalError(e instanceof Error?e.message:'请输入有效的参数 JSON')}
  }
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();if(!busy)onClose()}} className="m-auto w-[min(720px,95vw)] max-h-[90vh] rounded-2xl p-0 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xl backdrop:bg-slate-900/50" aria-labelledby="model-editor-title">
    <form onSubmit={submit} className="p-6 space-y-4">
      <header className="flex justify-between items-center"><h2 id="model-editor-title" className="font-black text-lg">{model?'编辑模型':'添加模型'}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭模型编辑">✕</button></header>
      <p className="text-xs text-slate-500">保存为新版本，只更新草稿。历史任务和当前生效配置保持原版本。</p>
      {(localError||error)&&<p role="alert" className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{localError||error}</p>}
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">供应商连接<select aria-label="连接操作" className={field} value={mode} onChange={e=>setMode(e.target.value)}>{connections.length>0&&<option value="reuse">复用已有连接</option>}<option value="new">新增连接</option>{oldConnection&&<option value="edit">修改当前连接 / 更换密钥</option>}</select></label>
        {mode==='reuse'?<label className="block text-sm">选择连接<select className={field} value={connectionId} onChange={e=>setConnectionId(e.target.value)}>{connections.map(c=><option value={c.id} key={c.id}>{c.name} · {c.protocol} · {c.id.slice(0,8)}</option>)}</select><span className="text-xs text-slate-500">密钥已保存，无需重复填写。</span></label>:<div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm">供应商名称<input required className={field} value={connection.name} onChange={e=>setConnection({...connection,name:e.target.value})} placeholder="例如 Kopix"/></label>
          <label className="text-sm">接口协议<select className={field} value={connection.protocol} onChange={e=>setConnection({...connection,protocol:e.target.value})}>{protocols.map(p=><option key={p}>{p}</option>)}</select></label>
          <label className="text-sm md:col-span-2">接口地址<input type="url" required className={field} value={connection.baseUrl} onChange={e=>setConnection({...connection,baseUrl:e.target.value})} placeholder="https://www.kopix.ai/v1"/></label>
          <label className="text-sm md:col-span-2">API 密钥<input type="password" autoComplete="new-password" required={mode==='new'} className={field} value={connection.secret} onChange={e=>setConnection({...connection,secret:e.target.value})} placeholder={mode==='edit'?'不更改地址或协议时可留空保留原密钥':'输入供应商 API Key'}/></label>
        </div>}
        <div className="grid md:grid-cols-2 gap-3"><label className="text-sm">显示名称<input required className={field} value={name} onChange={e=>setName(e.target.value)}/></label><label className="text-sm">模型 ID<input required className={field} value={modelName} onChange={e=>setModelName(e.target.value)} placeholder="glm-5.3"/></label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>允许加入待发布配置</label>
        <div className="flex flex-wrap gap-3">{Object.entries(modelCapabilityLabels).map(([id,label])=><label key={id} className="text-xs flex gap-1 items-center"><input type="checkbox" checked={capabilities.includes(id)} onChange={e=>setCapabilities(e.target.checked?[...capabilities,id]:capabilities.filter(c=>c!==id))}/>{label}</label>)}</div>
        <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><summary className="text-sm font-bold cursor-pointer">高级参数</summary><div className="space-y-3 mt-3">
          <label className="block text-sm">输入输出能力<input className={field} value={inputs} onChange={e=>setInputs(e.target.value)}/><span className="text-xs text-slate-500">逗号分隔：text_input、image_input、video_input、audio_input、audio_output、video_output、structured_json 等。保存声明后仍需预检。</span></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">超时（毫秒）<input type="number" min={1000} max={600000} required className={field} value={timeout} onChange={e=>setTimeoutValue(Number(e.target.value))}/></label><label className="text-sm">同一供应商重试次数<input type="number" min={0} max={3} required className={field} value={retries} onChange={e=>setRetries(Number(e.target.value))}/></label></div>
          <label className="block text-sm">输出额度与媒体限制 JSON<textarea rows={7} className={field+' font-mono'} value={parameters} onChange={e=>setParameters(e.target.value)}/></label>
        </div></details>
        <footer className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">取消</button><button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{busy?'保存中…':'保存到草稿'}</button></footer>
      </fieldset>
    </form>
  </dialog>
}
