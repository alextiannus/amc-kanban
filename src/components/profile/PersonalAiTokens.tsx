'use client'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,Copy,KeyRound,RefreshCw} from 'lucide-react'
type Token={id:string;name:string|null;prefix:string|null;createdAt:string;lastUsedAt:string|null;expiresAt:string|null;revokedAt:string|null}
export default function PersonalAiTokens({english=false,onBack}:{english?:boolean;onBack:()=>void}){
 const t=(zh:string,en:string)=>english?en:zh
 const [keys,setKeys]=useState<Token[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[secret,setSecret]=useState(''),[confirmId,setConfirmId]=useState<string|null>(null),[copied,setCopied]=useState(''),[uncertain,setUncertain]=useState(false)
 const lock=useRef(false),alive=useRef(true),generation=useRef(0)
 const endpoint='https://amc-kanban.immedi.ai/api/mcp'
 const load=async()=>{const seq=++generation.current;setError('');try{const r=await fetch('/api/profile/ai-tokens',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const data=await r.json();if(!alive.current||seq!==generation.current)return;setKeys(data.key?[data.key]:[]);setConfirmId(null);setUncertain(false)}catch{if(alive.current&&seq===generation.current)setError(t('无法读取 Token，请重新加载。','Unable to load tokens. Please reload.'))}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;generation.current++}},[])
 const mutate=async(method:'POST'|'DELETE',body:unknown)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('')
  try{const r=await fetch('/api/profile/ai-tokens',{method,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error();const data=await r.json();if(!alive.current)return;if(method==='POST'){setSecret(data.token);setCopied('')}setConfirmId(null);await load()}
  catch{if(alive.current){setUncertain(true);setError(t('操作结果未确认，请先重新加载核对；不会自动重试。','Result unconfirmed. Reload before another action; nothing is retried automatically.'))}}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label)}catch{setError(t('复制失败，请手动选择文字复制。','Copy failed. Select the text and copy manually.'))}}
 const date=(v:string|null)=>v?new Date(v).toLocaleString(english?'en-SG':'zh-CN'):t('尚未使用','Not used yet')
 const button='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800'
 return <section aria-label={t('配置 AI','Configure AI')} className="mx-auto w-full max-w-3xl space-y-8 p-4 pb-12 text-slate-900 dark:text-slate-100 sm:p-6">
  <button className={button} onClick={onBack}><ArrowLeft size={18}/>{t('返回个人资料','Back to profile')}</button>
  <header className="space-y-3"><h1 className="text-3xl font-semibold">{t('配置 AI','Configure AI')}</h1><p className="max-w-prose text-base leading-7 text-slate-600 dark:text-slate-300">{t('连接你的外部 AI 助手，以你的身份访问 AMC。所有操作遵循你当前的账号权限和品牌范围。','Connect your external AI assistant to AMC. It acts as you, within your current account permissions and brand access.')}</p></header>
  <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h2 className="text-xl font-semibold">{t('连接 AI 助手','Connect an AI assistant')}</h2><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('在支持远程 MCP 和 Bearer Token 的客户端中，填写以下地址，并使用你自己的 AI Token。','Use the address below in a client that supports remote MCP and Bearer tokens, together with your own AI token.')}</p><div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 break-all rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{endpoint}</code><button className={button} onClick={()=>copy(endpoint,'address')}><Copy size={16}/>{copied==='address'?t('已复制','Copied'):t('复制地址','Copy address')}</button></div><p className="text-sm text-slate-600 dark:text-slate-300">{t('认证方式：Bearer Token。使用当前 Token 连接。','Authentication: Bearer token. Use your current token to connect.')}</p></section>
  <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><KeyRound size={21}/>{t('我的 AI Token','My AI token')}</h2><button className={button} disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>{t('重新加载','Reload')}</button></div>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
   {secret&&<div className="space-y-3 rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-950"><p className="text-sm font-medium">{t('新 Token 仅显示这一次，请保存到你的 AI 客户端。','This new token is shown only once. Save it in your AI client.')}</p><code className="block select-all break-all text-sm">{secret}</code><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>copy(secret,'token')}><Copy size={16}/>{copied==='token'?t('已复制','Copied'):t('复制 Token','Copy token')}</button><button className={button} onClick={()=>{setSecret('');setCopied('')}}>{t('已保存，隐藏 Token','Saved — hide token')}</button></div></div>}
   {keys===null&&!error&&<p role="status">{t('正在读取…','Loading…')}</p>}
   {keys?.length===0&&<p className="py-5 text-slate-600 dark:text-slate-300">{t('你还没有 AI Token。创建一个来连接个人助手。','You have no AI tokens yet. Create one to connect your assistant.')}</p>}
   {keys&&<div className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
    {keys[0]&&<><p className="font-medium">{t('当前 Token','Current token')}</p><code className="block break-all text-sm">{keys[0].prefix?keys[0].prefix+'••••••••':t('已隐藏','Hidden')}</code><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('创建：','Created: ')}{date(keys[0].createdAt)}<br/>{t('最近使用：','Last used: ')}{date(keys[0].lastUsedAt)}</p></>}
    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{t('每人一个 Token，可用于多个 AI 客户端。刷新后旧 Token 立即失效，需要更新所有已连接的客户端。','One token per person, shared across your AI clients. Refreshing immediately invalidates the old token. Update all connected clients afterwards.')}</p>
    {confirmId?<div className="space-y-3"><p>{t('确认刷新？旧 Token 将立即失效。','Refresh your token? The old token will stop working immediately.')}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy||uncertain} onClick={()=>void mutate('POST',{expectedKeyId:confirmId})}>{busy?t('处理中…','Working…'):t('确认刷新','Confirm refresh')}</button><button className={button} disabled={busy} onClick={()=>setConfirmId(null)}>{t('取消','Cancel')}</button></div></div>:<button className={button} disabled={busy||uncertain||!!secret} onClick={()=>keys[0]?setConfirmId(keys[0].id):void mutate('POST',{expectedKeyId:null})}><RefreshCw size={17}/>{busy?t('处理中…','Working…'):keys[0]?t('刷新 Token','Refresh token'):t('创建 AI Token','Create AI token')}</button>}
   </div>}

  </section>
 </section>
}
