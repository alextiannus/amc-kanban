'use client'

import {CheckCircle2, Captions, MessageSquareText, MonitorPlay} from 'lucide-react'
import type {VideoShotTextReadState} from '@/vendor/mm-video/lib/video-editor-state'
import type {LegacyTextChoice} from '@/vendor/mm-video/lib/video-shot-text'
import type {VideoScene} from '@/vendor/mm-video/components/dashboard/../shared/types'
import {videoButton,videoField,type VideoTranslate} from '@/vendor/mm-video/components/dashboard/VideoWorkspaceShell'

export type VideoShotEditorFields={
  prompt:string
  spokenText:string
  captionMode:'mirror_spoken'|'off'
  overlayText:string
}

type Props={
  scene:VideoScene
  textState:VideoShotTextReadState
  recoveryText:string|null
  fields:VideoShotEditorFields
  disabled:boolean
  canonicalWriteAvailable:boolean
  onChange:(fields:VideoShotEditorFields)=>void
  onClassifyLegacy?:(choice:LegacyTextChoice)=>void
  t:VideoTranslate
}

export default function VideoShotTextEditor({scene,textState,recoveryText,fields,disabled,canonicalWriteAvailable,onChange,onClassifyLegacy,t}:Props){
  if(textState.kind==='invalid_v2')return <section role="alert" aria-labelledby="invalid-text-heading" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
    <div className="flex items-start gap-3"><MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-rose-700"/><div><h3 id="invalid-text-heading" className="text-sm font-bold text-rose-950">{t('分镜文字需要刷新','Refresh this scene')}</h3><p className="mt-1 text-xs leading-6 text-rose-800">{t('分镜文字数据不完整。为避免覆盖当前内容，请刷新项目后重试。','This scene has incomplete text data. Refresh the project before editing so current content is not overwritten.')}</p></div></div>
  </section>
  if(textState.kind==='legacy_unverified')return <section aria-labelledby="legacy-text-heading" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <div className="flex items-start gap-3"><MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><div><h3 id="legacy-text-heading" className="text-sm font-bold text-amber-950">{t('历史文字待确认','Legacy text needs confirmation')}</h3><p className="mt-1 text-xs leading-6 text-amber-800">{t('这段文字的用途无法从旧项目中确定。确认后才会启用新版口播与画面文字编辑。','The old project does not prove how this text was used. Classify it before editing the canonical spoken and overlay text.')}</p></div></div>
    {(scene.subtitle||scene.voiceoverText||scene.onScreenText)&&<blockquote className="mt-3 rounded-xl bg-white/80 p-3 text-sm leading-6 text-slate-700">{scene.subtitle||scene.voiceoverText||scene.onScreenText}</blockquote>}
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <button type="button" className={videoButton} disabled={disabled||!onClassifyLegacy} onClick={()=>onClassifyLegacy?.('spoken_caption')}>{t('作为口播与字幕','Use as spoken captions')}</button>
      <button type="button" className={videoButton} disabled={disabled||!onClassifyLegacy} onClick={()=>onClassifyLegacy?.('overlay')}>{t('作为画面文字','Use as overlay')}</button>
      <button type="button" className={videoButton} disabled={disabled||!onClassifyLegacy} onClick={()=>onClassifyLegacy?.('discard')}>{t('不使用','Do not use')}</button>
    </div>
    {!onClassifyLegacy&&<p className="mt-3 text-xs text-amber-800">{t('当前服务尚未开放历史文字确认，请稍后重试。','Legacy text confirmation is not available for this project yet.')}</p>}
  </section>
  return <div className="space-y-5">
    {recoveryText&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900"><strong>{t('已保留旧版未保存字幕','Recovered unsaved legacy subtitle')}</strong><p className="mt-1">{recoveryText}</p><p className="mt-1 text-amber-800">{t('旧版记录无法确认它是逐字字幕还是画面文字，因此没有自动写入；请核对后手动补到正确位置。','The old record does not prove whether this was a verbatim caption or overlay, so it was not inserted automatically. Review it and add it to the correct field.')}</p></div>}
    <label className="block text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><MonitorPlay className="h-4 w-4 text-violet-600"/>{t('画面说明','Visual direction')}</span><textarea aria-label={t('画面 Prompt','Visual prompt')} className={videoField} rows={5} value={fields.prompt} disabled={disabled} onChange={event=>onChange({...fields,prompt:event.target.value})}/></label>
    <div>
      <label className="block text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><Captions className="h-4 w-4 text-violet-600"/>{t('口播与逐字字幕','Spoken text & captions')}</span><textarea aria-label={t('口播与逐字字幕','Spoken text & captions')} className={videoField} rows={4} value={fields.spokenText} disabled={disabled||!canonicalWriteAvailable} onChange={event=>{const spokenText=event.target.value;onChange({...fields,spokenText,captionMode:spokenText.trim()?'mirror_spoken':'off'})}}/></label>
      <div className="mt-2 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/><span>{fields.captionMode==='mirror_spoken'?t('逐字字幕与口播保持一致，无需重复编辑。','Verbatim captions mirror this spoken text—there is no second caption field.'):t('此镜头没有口播，逐字字幕已关闭。','This shot has no spoken text, so verbatim captions are off.')}</span></div>
    </div>
    <label className="block text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-violet-600"/>{t('画面文字','Overlay text')}</span><textarea aria-label={t('画面文字','Overlay text')} className={videoField} rows={3} value={fields.overlayText} disabled={disabled||!canonicalWriteAvailable} onChange={event=>onChange({...fields,overlayText:event.target.value})}/></label>
    {!canonicalWriteAvailable&&<p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">{t('当前服务暂未开放分镜文字保存。画面说明仍可编辑；口播和画面文字保持只读。','Canonical shot-text saving is not available for this project. Visual direction remains editable; spoken and overlay text stay read-only.')}</p>}
  </div>
}
