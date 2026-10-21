import type {VideoScene,VideoShotTextV2} from '@/vendor/mm-video/components/shared/types'
import {videoShotText} from '@/vendor/mm-video/lib/video-shot-text'

type LegacyProjection=Extract<ReturnType<typeof videoShotText>,{contractVersion:null}>
export type VideoShotTextReadState=
  |{kind:'canonical';value:VideoShotTextV2}
  |{kind:'legacy_unverified';value:LegacyProjection}
  |{kind:'invalid_v2';value:LegacyProjection}

export type RestoredVideoShotFields={prompt:string;spokenText:string;captionMode:'mirror_spoken'|'off';overlayText:string}
export type RestoredVideoEditorSnapshot={fields:RestoredVideoShotFields;ambiguousLegacySubtitle:string|null}

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const ownString=(value:Record<string,unknown>,key:string)=>Object.hasOwn(value,key)&&typeof value[key]==='string'?value[key] as string:undefined

/** One validated projection controls display, classification, write availability and CAS. */
export function readVideoShotTextState(scene:unknown):VideoShotTextReadState{
  const raw=record(scene),value=videoShotText(scene)
  if(value.contractVersion===2)return {kind:'canonical',value}
  const declared=raw.textContractVersion??raw.contractVersion
  return declared==null?{kind:'legacy_unverified',value}:{kind:'invalid_v2',value}
}

/** Migrate Task 9 editor snapshots without guessing that an old subtitle was overlay copy. */
export function restoreVideoEditorSnapshot(scene:VideoScene,snapshot:unknown):RestoredVideoEditorSnapshot{
  const saved=record(snapshot),authority=readVideoShotTextState(scene)
  const baseline=authority.kind==='canonical'?authority.value:null
  const prompt=ownString(saved,'prompt')??scene.prompt
  const canonicalSpoken=ownString(saved,'spokenText'),legacySpoken=ownString(saved,'voiceoverText')
  const spokenText=canonicalSpoken??legacySpoken??baseline?.spokenText??''
  const savedCaptionMode=saved.captionMode
  const captionMode=savedCaptionMode==='mirror_spoken'||savedCaptionMode==='off'?savedCaptionMode:spokenText.trim()?'mirror_spoken':'off'
  const canonicalOverlay=ownString(saved,'overlayText')
  const legacySubtitle=ownString(saved,'subtitle')
  // This rare state is explicit evidence from an already-confirmed contract that
  // the compatibility subtitle stored overlay copy while captions were off.
  const subtitleProvenOverlay=baseline?.legacyTextStatus==='legacy_confirmed'&&baseline.captionMode==='off'&&!baseline.spokenText&&typeof scene.subtitle==='string'&&scene.subtitle===baseline.overlayText
  const overlayText=canonicalOverlay??(subtitleProvenOverlay?legacySubtitle:undefined)??baseline?.overlayText??''
  const derivedCaption=baseline?.captionText??''
  const ambiguousLegacySubtitle=legacySubtitle!==undefined&&!subtitleProvenOverlay&&legacySubtitle!==derivedCaption?legacySubtitle:null
  return {fields:{prompt,spokenText,captionMode,overlayText},ambiguousLegacySubtitle}
}

/** Preserve Task 9 numeric stage identities; only the removed assets stage migrates. */
export function restoreProductionVideoStage(stage:number|null,hasFinalVideo:boolean):0|2|3|null{
  if(stage===0||stage===1)return 0
  if(stage===2)return 2
  if(stage===3)return hasFinalVideo?3:2
  return null
}
