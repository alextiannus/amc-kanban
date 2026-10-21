'use client'

import CreativeVideoPreparation from '@/vendor/mm-video/components/dashboard/CreativeVideoPreparation'
import type {ScriptLanguage} from '@/vendor/mm-video/lib/video-languages'
import type {MaterialDecision} from '@/vendor/mm-video/lib/video-material-preflight'
import type {BasicVideoTemplate} from '@/vendor/mm-video/components/dashboard/../shared/types'
import type {VideoTranslate} from '@/vendor/mm-video/components/dashboard/VideoWorkspaceShell'

export type PreparationAsset={id:string;url:string;mimeType:string;aiCaption?:string|null;selected:boolean}
export type PreparationDraft={script:string;assets:PreparationAsset[];platforms:string[];duration:number;templateId:string}
export type PreparationProps={
  initialBindings?:import('@/vendor/mm-video/lib/video-material-preflight').MaterialBindings;
  copyPending?:boolean;copyError?:string;onRetryCopy?:()=>void;originalScript?:string;
  initialStage?:0|1;actorId:string;brandId:string;creativeId?:string;draftId:string;title:string;script:string;onScriptChange:(value:string)=>void;
  assets:PreparationAsset[];onToggleAsset:(id:string)=>void;onAddAssets:(onSelected?:(assets:PreparationAsset[])=>void)=>void;
  platforms:string[];onPlatformsChange:(value:string[])=>void;
  templates:BasicVideoTemplate[];templateId:string;onTemplateChange:(id:string)=>void;templateError?:string;templatesLoading:boolean;
  assetsBusy?:boolean;initialLanguage?:ScriptLanguage;initialGenerationLanguages?:ScriptLanguage[];maxImages?:number;maxVideos?:number;duration:number;onDurationChange:(value:number)=>void;minDuration?:number;maxDuration?:number;capabilityError?:string;onRetryCapabilities:()=>void;
  onBack:()=>void;onImageMode:()=>void;onGenerate:(decision?:MaterialDecision,language?:ScriptLanguage,options?:{languages:ScriptLanguage[];script:string})=>void;generateDisabled:boolean;
  onRestore:(draft:PreparationDraft)=>void;t:VideoTranslate;isEn:boolean
}
export default function VideoPreparationWorkspace(p:PreparationProps){return <CreativeVideoPreparation {...p}/> }
