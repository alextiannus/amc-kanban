// Mirrored in Kanban; contract version is checked before media publication.
export const EXECUTION_CONTRACT_VERSION = 1
const vision=['google','openai','custom_shim','kopix','deepseek','minimax']
const video=['cn_gateway','seedance','volcengine','kopix','baidu_seedance','baidu_qianfan_seedance','fal','kieai']
export const MEDIA_RULES:Record<string,{capability:string;protocols:string[];inputs:string[];gatewayTask?:string}>={
 image_understanding:{capability:'image_understanding',protocols:[...vision,'cn_gateway'],inputs:['image_input'],gatewayTask:'asset_image_analysis'},
 merchant_document_extraction:{capability:'image_understanding',protocols:[...vision,'cn_gateway'],inputs:['image_input','structured_json'],gatewayTask:'asset_image_analysis'},
 asset_image_analysis:{capability:'image_understanding',protocols:[...vision,'cn_gateway'],inputs:['image_input','structured_json'],gatewayTask:'asset_image_analysis'},
 reference_subtitle_ocr:{capability:'image_understanding',protocols:vision,inputs:['image_input','structured_json']},
 video_understanding:{capability:'video_understanding',protocols:[...vision,'cn_gateway'],inputs:['video_input'],gatewayTask:'reference_video_analysis'},
 reference_video_analysis:{capability:'video_understanding',protocols:[...vision,'cn_gateway'],inputs:['video_input','structured_json'],gatewayTask:'reference_video_analysis'},
 speech_recognition:{capability:'speech_recognition',protocols:vision,inputs:['audio_input']},
 reference_audio_transcription:{capability:'speech_recognition',protocols:vision,inputs:['audio_input','structured_json']},
 image_generation:{capability:'image_generation',protocols:[],inputs:['image_output']},
 video_generation:{capability:'video_generation',protocols:video,inputs:['video_output'],gatewayTask:'video_generation'},
 basic_video_generation:{capability:'video_generation',protocols:video.filter(p=>!['fal','kieai'].includes(p)),inputs:['video_output'],gatewayTask:'video_generation'},
 image_to_video:{capability:'video_generation',protocols:video,inputs:['video_output','reference_image'],gatewayTask:'video_generation'},
 video_provider:{capability:'video_generation',protocols:video,inputs:['video_output'],gatewayTask:'video_generation'},
 speech_synthesis:{capability:'speech_synthesis',protocols:['minimax'],inputs:['audio_output']},
 tts_generation:{capability:'speech_synthesis',protocols:['minimax'],inputs:['audio_output']},
 tts:{capability:'speech_synthesis',protocols:['minimax'],inputs:['audio_output']},
 music:{capability:'music',protocols:['minimax','stability'],inputs:['audio_output']},
 music_generation:{capability:'music',protocols:['minimax','stability'],inputs:['audio_output']},
}
export function mediaRule(task:string){const rule=MEDIA_RULES[task];if(!rule)throw new Error('Unknown media task: '+task);return rule}
export function assertMediaModel(task:string,model:any){
 const rule=mediaRule(task),d=model.definition
 if(model.protocol==='baidu_qianfan_seedance'){
  if(d?.qianfanApi!==undefined&&!['v2_fire','fire2'].includes(d.qianfanApi))throw new Error('Invalid Qianfan API')
  if(d?.modelName==='S2.5'&&d.qianfanApi!=='fire2')throw new Error('S2.5 new submissions require a Fire2 model version')
  if(d?.modelName!=='S2.5'&&d?.qianfanApi==='fire2')throw new Error('Fire2 is enabled only for S2.5')
 }
 if(['image_understanding','video_understanding','speech_recognition'].includes(rule.capability)&&d?.inputCapabilities?.includes('video_output'))throw new Error('Video generation input references do not provide standalone understanding or transcription')
 if(!rule.protocols.includes(model.protocol))throw new Error('Content has no '+task+' adapter for '+model.protocol)
 if(!d?.capabilities?.includes(rule.capability)||rule.inputs.some(c=>!d.inputCapabilities?.includes(c)))throw new Error('Model lacks required capabilities for '+task)
 return rule
}
export function resolveMediaModel(runtime:any,source:string,task:string,platform?:string){
 const rule=mediaRule(task),s=runtime.selection
 const id=(platform?s.exceptions[source+':'+task+':'+platform]:undefined)||s.exceptions[source+':'+task]||s.defaults[rule.capability]
 const m=runtime.models?.find((m:any)=>m.id===id)
 if(!m)throw new Error('No configured media model for '+source+':'+task)
 assertMediaModel(task,m);return m
}

export function qianfanPreflightRequests(runtime:any){
 const requests:Array<{source:string;task:string;platform?:string;modelId:string}>=[],s=runtime.selection
 // Reject obsolete entries even when a task exception shadows a default.
 for(const id of [...Object.values(s.defaults),...Object.values(s.exceptions)]){
  const model=runtime.models?.find((m:any)=>m.id===id)
  if(model?.protocol==='baidu_qianfan_seedance')assertMediaModel('video_generation',model)
 }
 const add=(source:string,task:string,id:string,platform?:string)=>{
  id=(platform?s.exceptions[source+':'+task+':'+platform]:undefined)||s.exceptions[source+':'+task]||id
  const model=runtime.models?.find((m:any)=>m.id===id)
  if(model?.protocol!=='baidu_qianfan_seedance')return
  assertMediaModel(task,model)
  if(model.definition.qianfanApi==='fire2')requests.push({source,task,platform,modelId:id})
 }
 for(const [task,id]of Object.entries(s.defaults))if(id&&task!=='text')add('content',task,id as string)
 for(const [key,id]of Object.entries(s.exceptions)){const [source,task,platform]=key.split(':');add(source,task,id as string,platform)}
 const delegated=s.exceptions['kanban:video_generation']||s.defaults.video_generation
 if(delegated)add('kanban','video_generation',delegated)
 // Also require a read-only probe for a selected default that all tested task
 // exceptions shadow. It can still serve other video tasks after publication.
 for(const id of new Set([...Object.values(s.defaults),...Object.values(s.exceptions)])){
  const model=runtime.models?.find((m:any)=>m.id===id)
  if(model?.protocol==='baidu_qianfan_seedance'&&model.definition.qianfanApi==='fire2')requests.push({source:'content',task:'video_generation',modelId:model.id})
 }
 return requests
}
export function assertQianfanPreflightConfirmation(requests:ReturnType<typeof qianfanPreflightRequests>,tasks:any){
 if(requests.some(expected=>!Array.isArray(tasks)||!tasks.some((t:any)=>t.source===expected.source&&t.task===expected.task&&t.platform===expected.platform&&t.modelId===expected.modelId&&t.executor==='content'&&t.passed===true&&t.qianfanApi==='fire2')))throw new Error('Content did not confirm Fire2 for each selected candidate task; deploy Fire2-capable Content first')
}
