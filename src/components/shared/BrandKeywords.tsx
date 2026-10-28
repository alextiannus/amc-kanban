'use client'
import {useEffect,useRef,useState} from 'react'
import {Plus,X,Search} from 'lucide-react'
type Tag={id?:string;label:string}
type Props={brandId:string;english?:boolean;compact?:boolean;onSaved?:()=>void}
const messages:Record<string,[string,string]>={brand_keywords_changed:['关键词已被其他页面更新，请重新打开后编辑。','Keywords changed elsewhere. Reopen to edit the latest version.'],keyword_unavailable:['该标签尚未启用或属于脚本类型，请选择其他关键词。','This tag is unavailable or a script type. Choose another keyword.'],ambiguous_keyword_alias:['这个名称对应多个标签，请从已有标签中选择。','This name matches multiple tags. Select an existing tag.'],invalid_keyword_label:['请使用简短的卖点或主题词，不要使用长句、价格或热量数值。','Use a concise benefit or topic, without sentences, prices or calorie quantities.']}
export default function BrandKeywords({brandId,english=false,compact=false,onSaved}:Props){
 const t=(zh:string,en:string)=>english?en:zh
 const [open,setOpen]=useState(!compact),[data,setData]=useState<any>(null),[entries,setEntries]=useState<Tag[]>([]),[options,setOptions]=useState<Tag[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
 const [reload,setReload]=useState(0)
 const alive=useRef(true),editing=useRef(false)
 const base=`/api/brands/${encodeURIComponent(brandId)}/keywords`
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{if(!open)return;const controller=new AbortController();setError('');setData(null);editing.current=false;setBusy(true)
  void fetch(base,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d}).then(d=>{if(!controller.signal.aborted){setData(d);setEntries(d.tags||[])}}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
  return()=>controller.abort()
 },[base,open,reload])
 useEffect(()=>{if(!open)return;const controller=new AbortController();const timer=setTimeout(()=>void fetch(`${base}?q=${encodeURIComponent(query)}`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(!controller.signal.aborted)setOptions(d.items||[])}).catch(()=>{if(!controller.signal.aborted)setOptions([])}),180);return()=>{clearTimeout(timer);controller.abort()}},[base,query,open])
 useEffect(()=>{const sync=()=>{if(editing.current){setError('brand_keywords_changed');return}setReload(v=>v+1)};const changed=(e:Event)=>{if((e as CustomEvent).detail?.brandId===brandId)sync()};window.addEventListener('focus',sync);window.addEventListener('amc:brand-keywords',changed);return()=>{window.removeEventListener('focus',sync);window.removeEventListener('amc:brand-keywords',changed)}},[brandId])
 const add=(tag:Tag)=>{if(!data?.canEdit||busy)return;setEntries(old=>old.some(v=>tag.id?v.id===tag.id:v.label.normalize('NFKC').toLowerCase()===tag.label.normalize('NFKC').toLowerCase())?old:[...old,tag]);editing.current=true;setSaved(false);setQuery('')}
 async function save(){if(!data?.canEdit||busy)return;setBusy(true);setError('');try{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:data.revision,entries:entries.map(v=>v.id?{id:v.id}:{label:v.label})})});const next=await r.json();if(!r.ok)throw Error(next.error);if(!alive.current)return;setData({...next,canEdit:true});setEntries(next.tags);editing.current=false;setSaved(true);window.dispatchEvent(new CustomEvent('amc:brand-keywords',{detail:{brandId}}));onSaved?.()}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}
 if(!open)return <button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-600" onClick={()=>{setOpen(true);setSaved(false)}}><Plus size={15}/>{t('管理品牌关键词','Manage brand keywords')}</button>
 return <section className={`my-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 ${compact?'max-h-[55dvh] overflow-y-auto':''}`} aria-label={t('品牌卖点关键词','Brand selling-point keywords')}>
  <div className="mb-2 flex items-center justify-between gap-2"><h4 className="font-semibold">{t('品牌卖点关键词','Brand selling-point keywords')}</h4>{compact&&<button type="button" disabled={busy} onClick={()=>setOpen(false)} aria-label={t('关闭关键词编辑','Close keyword editor')}><X size={19}/></button>}</div>
  <p className="mb-3 text-xs leading-5 text-slate-500">{t('与营销策略、创意匹配共用。优先保留有代表性的卖点，也可添加活动主题。','Shared by marketing strategy and idea matching. Keep distinctive benefits and relevant campaign themes.')}</p>
  <div className="flex flex-wrap gap-2">{entries.map((tag,i)=><span key={tag.id||tag.label} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm">{tag.label}{data?.canEdit&&<button type="button" disabled={busy} aria-label={`${t('移除','Remove')} ${tag.label}`} onClick={()=>{setEntries(v=>v.filter((_,n)=>n!==i));editing.current=true;setSaved(false)}}><X size={14}/></button>}</span>)}</div>
  {busy&&!data&&<p role="status" className="py-3 text-sm">{t('正在读取关键词…','Loading keywords…')}</p>}
  {data?.canEdit&&<><label className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3"><Search size={17}/><input className="min-h-11 min-w-0 flex-1 bg-transparent outline-none" aria-label={t('查找或新增关键词','Find or add keyword')} placeholder={t('查找已有关键词，或输入新词','Find an existing keyword or enter a new one')} value={query} maxLength={80} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto" aria-label={t('已有关键词','Existing keywords')}>{options.filter(v=>!entries.some(e=>e.id===v.id)).map(tag=><button type="button" disabled={busy} key={tag.id} onClick={()=>add(tag)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{tag.label}</button>)}</div>
  {query.trim()&&!options.some(v=>v.label.toLowerCase()===query.trim().toLowerCase())&&<button type="button" disabled={busy} onClick={()=>add({label:query.trim()})} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm"><Plus size={16}/>{t('新增','Add new')}: {query.trim()}</button>}
  <button type="button" disabled={busy} onClick={()=>void save()} className="mt-4 min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40">{busy?t('保存中…','Saving…'):t('保存关键词','Save keywords')}</button></>}
  {saved&&<p role="status" className="mt-2 text-sm text-emerald-700">{t('已保存，两处共用最新关键词。','Saved. Both views use these keywords.')}</p>}
  {error&&<button type="button" disabled={busy} className="mt-2 min-h-10 underline" onClick={()=>{setReload(v=>v+1);setSaved(false)}}>{t('重新读取关键词','Reload keywords')}</button>}
  {error&&<p role="alert" className="mt-2 text-sm text-red-700">{messages[error]?.[english?1:0]||t('暂时无法读取或保存，请重新打开重试。','Unable to load or save. Reopen to retry.')}</p>}
 </section>
}
