'use client'

import {useEffect, useRef, useState, type ReactNode} from 'react'
import {ArrowLeft, Check, ChevronDown, ChevronUp, Clapperboard, Image as ImageIcon, PanelLeftClose, PanelLeftOpen} from 'lucide-react'
import {getPlatformLogo, getPlatformMeta} from '@/vendor/mm-video/components/dashboard/../shared/platformUtils'
import {VIDEO_PLATFORMS} from '@/vendor/mm-video/lib/video-platforms'
import {loadVideoWorkspaceState,saveVideoWorkspaceState,type VideoWorkspacePreparationDraft,type VideoWorkspaceState} from '@/vendor/mm-video/lib/video-workspace-return'

export type VideoStage = 0 | 1 | 2 | 3
export type VideoTranslate = (zh: string, en: string) => string
export const videoButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-40'
export const videoPrimary = `${videoButton} !border-violet-600 !bg-violet-600 !text-white hover:!bg-violet-700`
export const videoField = 'mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base leading-7 text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:text-sm'

export function VideoPlatformIcons({value,onChange,disabled=false,single=false,t}:{value:string[];onChange?:(platforms:string[])=>void;disabled?:boolean;single?:boolean;t:VideoTranslate}) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-slate-100 bg-white px-4 py-3 sm:px-6">
    <span className="text-xs font-semibold text-slate-500">{t('适配平台','Platforms')}</span>
    <div className="flex items-center gap-2" role="group" aria-label={t('适配平台','Target platforms')}>
      {VIDEO_PLATFORMS.map(platform=>{const selected=value.includes(platform);const meta=getPlatformMeta(platform,t('zh','en')==='en');return <button key={platform} type="button" aria-label={meta.label} title={meta.label} aria-pressed={selected} disabled={disabled||!onChange} onClick={()=>onChange?.(single?[platform]:selected?value.length>1?value.filter(p=>p!==platform):value:[...value,platform])} className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:cursor-default ${selected?'border-violet-300 bg-white ring-2 ring-violet-100':'border-slate-200 bg-slate-50 hover:border-violet-200'}`}>
        {getPlatformLogo(platform,'h-7 w-7')}
        {selected&&<span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white"><Check className="h-2.5 w-2.5"/></span>}
      </button>})}
    </div>
  </div>
}

export default function VideoWorkspaceShell({title,subtitle,status,stage,onStageChange,availableStages=[0,2,3],stageLabels,onBack,onImageMode,actions,platformControls,platforms,onPlatformsChange,platformsDisabled,singlePlatform,sidebar,preview,children,footer,editingActions,t,fullscreen=true,workspaceActorId,workspaceBrandId,workspaceProjectId,workspaceProjectRevision=null,validShotIds,selectedShotId=null,preparationDraft=null,unsavedEdits=null,onRestoreWorkspaceState}:{
  title:string;subtitle?:string;status?:ReactNode;stage:VideoStage;onStageChange?:(stage:VideoStage)=>void;availableStages?:VideoStage[];stageLabels?:Array<{value:VideoStage;label:string}>;onBack?:()=>void;onImageMode?:()=>void;actions?:ReactNode;platformControls?:ReactNode;platforms:string[];onPlatformsChange?:(platforms:string[])=>void;platformsDisabled?:boolean;singlePlatform?:boolean;sidebar?:ReactNode;preview:ReactNode;children:ReactNode;footer?:ReactNode;editingActions?:ReactNode;t:VideoTranslate;fullscreen?:boolean;
  workspaceActorId?:string;workspaceBrandId?:string;workspaceProjectId?:string;workspaceProjectRevision?:string|null;validShotIds?:string[];selectedShotId?:string|null;preparationDraft?:VideoWorkspacePreparationDraft|null;unsavedEdits?:Record<string,unknown>|null;onRestoreWorkspaceState?:(state:VideoWorkspaceState)=>void
}) {
  const [mobilePreview,setMobilePreview]=useState(stage>=2)
  const [sceneListOpen,setSceneListOpen]=useState(true)
  const [hydratedWorkspaceKey,setHydratedWorkspaceKey]=useState('')
  const restoreStateRef=useRef(onRestoreWorkspaceState)
  restoreStateRef.current=onRestoreWorkspaceState
  const workspaceKey=workspaceActorId&&workspaceBrandId&&workspaceProjectId?`${workspaceActorId}:${workspaceBrandId}:${workspaceProjectId}:${workspaceProjectRevision||''}`:''
  const validShotKey=validShotIds?.join('\u0000')||''
  useEffect(()=>{
    if(!workspaceActorId||!workspaceBrandId||!workspaceProjectId||typeof sessionStorage==='undefined'){setHydratedWorkspaceKey('');return}
    const saved=loadVideoWorkspaceState(sessionStorage,workspaceActorId,workspaceBrandId,workspaceProjectId,{projectRevision:workspaceProjectRevision,validSceneIds:validShotIds})
    if(saved)restoreStateRef.current?.(saved)
    setHydratedWorkspaceKey(workspaceKey)
  },[workspaceActorId,workspaceBrandId,workspaceProjectId,workspaceProjectRevision,workspaceKey,validShotKey])
  useEffect(()=>{
    if(!workspaceActorId||!workspaceBrandId||!workspaceProjectId||hydratedWorkspaceKey!==workspaceKey||typeof sessionStorage==='undefined')return
    saveVideoWorkspaceState(sessionStorage,{actorId:workspaceActorId,brandId:workspaceBrandId,projectId:workspaceProjectId,projectRevision:workspaceProjectRevision,stage,selectedShotId,preparationDraft,unsavedEdits})
  },[workspaceActorId,workspaceBrandId,workspaceProjectId,workspaceProjectRevision,workspaceKey,hydratedWorkspaceKey,stage,selectedShotId,preparationDraft,unsavedEdits])
  const stages=stageLabels||[
    {value:0 as VideoStage,label:t('脚本与素材','Script & assets')},
    {value:2 as VideoStage,label:t('分镜编辑','Scene edit')},
    {value:3 as VideoStage,label:t('成片审核','Final review')},
  ]
  return <div className={`${fullscreen?'fixed inset-0 z-[90] h-[100dvh]':'relative h-[calc(100dvh-8rem)] min-h-[480px] rounded-2xl border border-slate-200'} flex flex-col overflow-hidden bg-[#f5f6fa] text-slate-900 pointer-events-auto`}>
    <header className="shrink-0 bg-white pt-[env(safe-area-inset-top,0px)]">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2">{onBack&&<button type="button" className={videoButton} onClick={onBack} aria-label={t('返回','Back')}><ArrowLeft className="h-4 w-4"/></button>}<span className="rounded-lg bg-violet-600 px-2 py-1.5 text-xs font-bold text-white">AMC</span><span className="hidden text-sm font-semibold sm:inline">{t('创作工作台','Creative workspace')}</span></div>
        <div className="flex items-center rounded-xl bg-slate-100 p-1"><span className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm"><Clapperboard className="h-4 w-4"/>{t('视频','Video')}</span>{onImageMode&&<button type="button" onClick={onImageMode} className="flex min-h-10 items-center gap-2 px-3 text-xs font-semibold text-slate-500"><ImageIcon className="h-4 w-4"/>{t('图片 / 图文','Image / Post')}</button>}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 sm:py-4"><div className="min-w-0 flex-1"><p className="hidden text-xs text-slate-400 sm:block">{subtitle||t('品牌内容 / 视频项目','Brand content / Video project')}</p><h1 className="truncate text-sm font-bold sm:mt-1 sm:text-xl" title={title}>{title}</h1>{status&&<div className="mt-1 text-xs text-slate-500" role="status">{status}</div>}</div><div className="flex flex-wrap items-center gap-2">{actions}</div></div>
      {platformControls??<VideoPlatformIcons value={platforms} onChange={onPlatformsChange} disabled={platformsDisabled} single={singlePlatform} t={t}/>}
      <nav className="grid border-b border-slate-200 bg-white px-2 sm:px-6" style={{gridTemplateColumns:`repeat(${stages.length}, minmax(0, 1fr))`}} aria-label={t('视频制作阶段','Video production stages')}>
        {stages.map((item,index)=><button type="button" key={item.value} disabled={!availableStages.includes(item.value)} onClick={()=>{setMobilePreview(item.value>=2);onStageChange?.(item.value)}} aria-current={stage===item.value?'step':undefined} className={`group relative flex min-h-14 items-center justify-center gap-2 px-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-35 sm:text-xs ${stage===item.value?'text-violet-700':'text-slate-500'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition motion-reduce:transition-none ${stage===item.value?'border-violet-600 bg-violet-600 text-white shadow-[0_0_0_4px_rgba(124,58,237,.1)]':'border-slate-300 bg-white'}`}>{index+1}</span><span>{item.label}</span><span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full transition motion-reduce:transition-none ${stage===item.value?'bg-violet-600':'bg-transparent'}`}/></button>)}
      </nav>
    </header>
    <button type="button" onClick={()=>setMobilePreview(v=>!v)} aria-expanded={mobilePreview} className="flex min-h-10 shrink-0 items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 lg:hidden">{mobilePreview?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}{mobilePreview?t('收起预览，专注编辑','Collapse preview to edit'):t('展开视频预览','Show preview')}</button>
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain lg:overflow-hidden`}>
      <div className={`flex min-h-full flex-col lg:grid lg:h-full lg:min-h-0 ${sceneListOpen?'lg:grid-cols-[156px_minmax(0,1fr)_minmax(300px,380px)]':'lg:grid-cols-[44px_minmax(0,1fr)_minmax(300px,380px)]'}`}>
        <aside className="order-2 flex shrink-0 gap-2 overflow-x-auto border-y border-slate-200 bg-white p-2 lg:order-1 lg:block lg:min-h-0 lg:overflow-y-auto lg:border-y-0 lg:border-r lg:p-3"><button type="button" onClick={()=>setSceneListOpen(value=>!value)} aria-expanded={sceneListOpen} aria-label={sceneListOpen?t('收起分镜列表','Collapse scene list'):t('展开分镜列表','Expand scene list')} className="hidden h-9 w-full items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 lg:flex">{sceneListOpen?<PanelLeftClose className="h-4 w-4"/>:<PanelLeftOpen className="h-4 w-4"/>}</button><div className={sceneListOpen?'contents':'lg:hidden'}>{sidebar}</div></aside>
        <section className={`${mobilePreview?'flex':'hidden'} order-1 min-w-0 flex-col items-center justify-start gap-2 bg-[#f5f6fa] p-3 lg:order-2 lg:flex lg:gap-3 lg:overflow-y-auto lg:p-5`}>{preview}</section>
        <section onFocusCapture={event=>{if(event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLInputElement)setMobilePreview(false)}} className="order-3 flex min-w-0 flex-col bg-white lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-slate-200">{children}</section>
      </div>
    </div>
    {editingActions&&<div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom,0px))] lg:px-6">{editingActions}</div>}
    {footer&&<footer className="hidden shrink-0 border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-500 lg:block">{footer}</footer>}
  </div>
}
