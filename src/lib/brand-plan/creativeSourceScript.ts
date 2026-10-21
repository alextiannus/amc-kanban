// originalText is often a social-post caption. A video script comes from shots.
export function creativeSourceScript(source:any):string{
 const timeline=[source?.timeline,source?.sourceEvidence?.timeline,source?.scriptContent?.timeline].find(value=>Array.isArray(value)&&value.length)||[]
 if(!timeline.some((shot:any)=>typeof shot?.visualDescription==='string'&&shot.visualDescription.trim()))return ''
 const fields=[['visualDescription','画面'],['shotScale','景别'],['cameraMovement','运镜'],['subjectAction','动作'],['voiceover','口播'],['onScreenText','字幕'],['sound','声音'],['narrativePurpose','叙事作用'],['transition','转场']] as const
 return timeline.map((shot:any,index:number)=>[
  `镜头 ${index+1}${Number.isFinite(shot.startSec)&&Number.isFinite(shot.endSec)?` · ${shot.startSec}–${shot.endSec}s`:''}`,
  ...fields.flatMap(([key,label])=>typeof shot[key]==='string'&&shot[key].trim()?[`${label}：${shot[key].trim()}`]:[]),
  ...(Array.isArray(shot.continuityRequirements)&&shot.continuityRequirements.length?[`连续性：${shot.continuityRequirements.filter((v:any)=>typeof v==='string').join('；')}`]:[]),
 ].join('\n')).join('\n\n')
}
