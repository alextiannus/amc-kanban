export function sceneMatchesSourceShot(scene:{prompt:string;sourceShotIds?:string[]},sourceShotId:string):boolean {
  if(Array.isArray(scene.sourceShotIds))return scene.sourceShotIds.includes(sourceShotId)
  // Only old prompts without structured provenance use explicit token boundaries.
  const escaped=sourceShotId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return Boolean(sourceShotId)&&new RegExp(`(^|[^\\p{L}\\p{N}_:/.-])${escaped}(?=$|[^\\p{L}\\p{N}_:/.-])`,'u').test(scene.prompt)
}
export const videoFieldLabels:Record<string,[string,string]>={prompt:['画面描述','Visual description'],subtitle:['字幕','Subtitle'],voiceoverText:['口播','Voiceover'],sku_mismatch:['商品不匹配','Product mismatch'],selling_point:['卖点表达','Selling point'],transitions:['转场衔接','Transitions'],visual_description:['画面描述','Visual description'],voiceover:['口播表达','Voiceover'],platform_style:['平台风格','Platform style'],material_feasibility:['素材可用性','Material feasibility'],brand_facts:['品牌事实','Brand facts'],other:['其他','Other']}
export function revisionMatchesScene(row:{sceneId:string;affectedSceneIds?:string[];jobs?:Array<{sceneId?:string}>},scene?:{id:string;relatedSceneIds?:string[]}){
  if(!scene||row.sceneId==='all-shots')return true
  const ids=[scene.id,...(scene.relatedSceneIds||[])]
  return ids.includes(row.sceneId)||(row.affectedSceneIds||row.jobs?.map(job=>job.sceneId)||[]).some(id=>Boolean(id&&ids.includes(id)))
}
