'use client'

import {Sparkles, X} from 'lucide-react'
import {VIDEO_REVISION_REASONS,type VideoFeedback} from '@/vendor/mm-video/lib/video-revisions'
import {videoFieldLabels} from '@/vendor/mm-video/lib/video-shot-lineage'
import {videoButton,videoField,type VideoTranslate} from '@/vendor/mm-video/components/dashboard/VideoWorkspaceShell'
import type {VideoShotEditorFields} from '@/vendor/mm-video/components/dashboard/VideoShotTextEditor'

type Candidate={jobId:string;sceneId:string;fields:VideoShotEditorFields}
type Props={
  jobId:string;sceneId:string;feedback:VideoFeedback;candidate:Candidate|null;disabled:boolean;canSuggest:boolean;isEn:boolean;t:VideoTranslate
  onFeedbackChange:(value:VideoFeedback)=>void;onSuggest:()=>void;onCandidateChange:(candidate:Candidate)=>void;onUseCandidate:()=>void;onDiscardCandidate:()=>void
}

export default function VideoRevisionDrawer(props:Props){
  const {t}=props
  const candidate=props.candidate?.jobId===props.jobId&&props.candidate.sceneId===props.sceneId?props.candidate:null
  return <details className="group rounded-2xl border border-slate-200 bg-white">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600"/>{t('修改与 AI 优化','Edits & suggestions')}</span><span className="text-xs font-normal text-slate-400 group-open:hidden">{t('可选','Optional')}</span></summary>
    <div className="border-t border-slate-100 p-4">
      <p className="text-xs font-semibold text-slate-500">{t('这次主要修改了什么','What changed')}</p><div className="mt-2 flex flex-wrap gap-2">{VIDEO_REVISION_REASONS.map(reason=><button type="button" key={reason} aria-pressed={props.feedback.reasons?.includes(reason)} className={`${videoButton} ${props.feedback.reasons?.includes(reason)?'!border-violet-400 !bg-violet-50 !text-violet-700':''}`} onClick={()=>props.onFeedbackChange({...props.feedback,reasons:props.feedback.reasons?.includes(reason)?props.feedback.reasons.filter(value=>value!==reason):[...(props.feedback.reasons||[]),reason]})}>{videoFieldLabels[reason]?.[props.isEn?1:0]||t('其他','Other')}</button>)}</div>
      <label className="mt-4 block text-xs font-semibold text-slate-500">{t('修改说明','Edit note')}<textarea className={videoField} maxLength={2000} value={props.feedback.note||''} onChange={event=>props.onFeedbackChange({...props.feedback,note:event.target.value})}/></label>
      <label className="mt-4 block text-xs font-semibold text-slate-500">{t('AI 修改要求','AI instruction')}<textarea className={videoField} maxLength={4000} value={props.feedback.instruction||''} onChange={event=>props.onFeedbackChange({...props.feedback,instruction:event.target.value})}/></label>
      <button type="button" className={`${videoButton} mt-3`} disabled={props.disabled||!props.canSuggest||!props.feedback.instruction?.trim()} onClick={props.onSuggest}><Sparkles className="h-4 w-4"/>{t('生成改写候选','Suggest rewrite')}</button>
      {candidate&&<div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-violet-950">{t('改写候选','Rewrite candidate')}</h3><button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white" aria-label={t('放弃候选','Discard candidate')} onClick={props.onDiscardCandidate}><X className="h-4 w-4"/></button></div>{(['prompt','spokenText','overlayText'] as const).map(key=>{const label=key==='prompt'?t('画面描述','Visual description'):key==='spokenText'?t('口播与逐字字幕','Spoken text & captions'):t('画面文字','Overlay text');return <label className="mt-3 block text-xs font-semibold text-slate-600" key={key}>{t('候选','Candidate')} {label}<textarea aria-label={`${t('候选','Candidate')} ${label}`} className={videoField} value={candidate.fields[key]} onChange={event=>props.onCandidateChange({...candidate,fields:{...candidate.fields,[key]:event.target.value,...(key==='spokenText'?{captionMode:event.target.value.trim()?'mirror_spoken':'off'}:{})}})}/></label>})}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={videoButton} onClick={props.onUseCandidate}>{t('采用到待保存修改','Use in unsaved edits')}</button><button type="button" className={videoButton} onClick={props.onDiscardCandidate}>{t('放弃候选','Discard candidate')}</button></div><p className="mt-2 text-xs leading-5 text-violet-700">{t('采用后只会进入未保存修改，请检查后再保存。','Using a candidate only updates your unsaved draft. Review it before saving.')}</p></div>}
    </div>
  </details>
}
