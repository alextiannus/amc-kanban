// Mirrored in Kanban; contract version is checked before media publication.
export const EXECUTION_CONTRACT_VERSION = 1
const vision=['google','openai','custom_shim','kopix','deepseek','minimax']
const video=['cn_gateway','seedance','volcengine','kopix','baidu_seedance','fal','kieai']
export const MEDIA_RULES:Record<string,{capability:string;protocols:string[];inputs:string[];gatewayTask?:string}>={
 image_understanding:{capability:'image_understanding',protocols:[...vision,'cn_gateway'],inputs:['image_input'],gatewayTask:'asset_image_analysis'},
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
 music:{capability:'music',protocols:['minimax'],inputs:['audio_output']},
 music_generation:{capability:'music',protocols:['minimax'],inputs:['audio_output']},
}
export function mediaRule(task:string){const rule=MEDIA_RULES[task];if(!rule)throw new Error('Unknown media task: '+task);return rule}
export function assertMediaModel(task:string,model:any){
 const rule=mediaRule(task),d=model.definition
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
