export const VIDEO_REVISION_REASONS=['sku_mismatch','selling_point','transitions','visual_description','voiceover','subtitle','platform_style','material_feasibility','brand_facts','other'] as const
export type VideoFeedback={reasons?:string[];note?:string;instruction?:string;candidateAdopted?:boolean}
export type VideoRenderResult={outcome:'not_submitted'|'unknown'|'submitted'|'completed'|'failed';error?:string}
export type VideoRevision={id:string;sceneId:string;affectedSceneIds?:string[];method:string;reasons:string[];note:string;instruction:string;candidateAdopted?:boolean;renderVersion:number;createdAt?:string;actorId?:string;fields:Array<{field:string;before:unknown;after:unknown}>;revisionFeedbackWrite?:{schemaVersion:'revision_feedback_revision@1';requestId:string;digest:string;projectId:string;brandId:string;shotId:string;action:'save_scene'|'save_shot_text'|'save_feedback';scriptVersion:string}}
export function videoRevisionInput(input:VideoFeedback={}){
  const reasons=input.reasons??[],note=input.note??'',instruction=input.instruction??'',candidateAdopted=input.candidateAdopted??false
  if(!Array.isArray(reasons)||reasons.length>10||reasons.some(r=>!VIDEO_REVISION_REASONS.includes(r as any))||typeof note!=='string'||note.length>2000||typeof instruction!=='string'||instruction.length>4000||typeof candidateAdopted!=='boolean')throw new Error('invalid_video_feedback')
  return {reasons:[...new Set(reasons)],note,instruction,candidateAdopted}
}
export function videoFeedbackFields(input:VideoFeedback={}):Array<'reasons'|'note'|'instruction'|'candidateAdopted'>{
  const value=videoRevisionInput(input),fields:Array<'reasons'|'note'|'instruction'|'candidateAdopted'>=[]
  if(value.reasons.length)fields.push('reasons')
  if(value.note.trim())fields.push('note')
  if(value.instruction.trim())fields.push('instruction')
  if(value.candidateAdopted)fields.push('candidateAdopted')
  return fields
}
export const hasVideoFeedback=(input:VideoFeedback={})=>videoFeedbackFields(input).length>0
export function recordVideoRevision(input:{id:string;sceneId:string;method:string;before:Record<string,unknown>;after:Record<string,unknown>;feedback?:VideoFeedback;instruction?:string;renderVersion:number}):VideoRevision{
  return {id:input.id,sceneId:input.sceneId,method:input.method,...videoRevisionInput({...input.feedback,instruction:input.instruction}),renderVersion:input.renderVersion,fields:Object.keys(input.after).filter(field=>JSON.stringify(input.before[field])!==JSON.stringify(input.after[field])).map(field=>({field,before:input.before[field]??null,after:input.after[field]??null}))}
}
