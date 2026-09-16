export const CAPABILITIES = ['text','image_understanding','video_understanding','image_generation','video_generation','speech_recognition','speech_synthesis','music'] as const
export type Capability = typeof CAPABILITIES[number]
export type ModelDefinition = {
  isEnabled?:boolean; previousModelId?:string;
  name:string; modelName:string; capabilities:Capability[]; inputCapabilities:string[];
  timeoutMs:number; maxRetries:number; temperature?:number; jsonMode?:boolean;
  maxTokensByTask?:Record<string,number>; videoConstraints?:Record<string,unknown>; costMetadata?:Record<string,unknown>;
  reasoningEffort?:'low'|'high'|'max';
}
export type Selection = {defaults:Partial<Record<Capability,string>>; exceptions:Record<string,string>}
export type CatalogModel = {id:string;connectionId:string;legacyId?:string;definition:ModelDefinition}
export type RuntimeModel = CatalogModel & {protocol:string;baseUrl:string;connectionName:string;secretRef:string}
export type RuntimeConfig = {protocolVersion:2;version:number|null;active:boolean;selection?:Selection;models?:RuntimeModel[];secrets?:Record<string,string>}
export function capabilityFor(task:string,required:string[]=[]):Capability {
  if((CAPABILITIES as readonly string[]).includes(task))return task as Capability
  if(task==='tts'||task==='tts_generation'||task==='voice_clone')return 'speech_synthesis'
  if(task==='music_generation')return 'music'
  if(['video_generation','basic_video_generation','image_to_video','video_provider'].includes(task)||required.includes('video_output'))return 'video_generation'
  if(task==='image_generation'||required.includes('image_output'))return 'image_generation'
  if(task==='reference_audio_transcription'||required.includes('audio_input'))return 'speech_recognition'
  if(task==='reference_video_analysis'||required.includes('video_input'))return 'video_understanding'
  if(task==='reference_subtitle_ocr'||required.includes('image_input')||task==='asset_image_analysis')return 'image_understanding'
  return 'text'
}
export function selectModel(config:RuntimeConfig,source:string,task:string,capability:Capability,required:string[]=[]):RuntimeModel {
  if(!config.active||!config.selection)throw new Error('Unified model policy is not active')
  const id=(capability==='text'?undefined:config.selection.exceptions[`${source}:${task}`])||config.selection.defaults[capability]
  const model=config.models?.find(m=>m.id===id)
  if(!model||!model.definition.capabilities.includes(capability))throw new Error(`No compatible central model for ${source}:${task} (${capability})`)
  if(required.some(c=>!model.definition.inputCapabilities.includes(c)))throw new Error(`Selected central model lacks required capabilities for ${task}`)
  return model
}
