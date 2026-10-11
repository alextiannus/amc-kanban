import {CREATIVE_EDIT_FIELDS,CreativeRevisionError,stableJson} from './creativeRevisionContract'
export const REVISION_REASONS=['sku','transitions','visual_description','voiceover','brand_facts','other'] as const
export function validateCreativeFeedback(value:any){
 if(value===undefined||value===null)return null
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['reasons','note'].includes(k))||!Array.isArray(value.reasons)||value.reasons.length>6||value.reasons.some((r:any)=>!REVISION_REASONS.includes(r))||typeof value.note!=='string'||value.note.length>2000)throw new CreativeRevisionError('invalid_creative_feedback')
 return {reasons:[...new Set(value.reasons)] as string[],note:value.note.trim()}
}
const platform=(value:any)=>String(value.platformSlug||value.platform||'').toLowerCase().replace('google business','google_business').replace('小红书','xiaohongshu')
export function creativeChanges(before:any,after:any){return CREATIVE_EDIT_FIELDS.filter(field=>field==='platform'?platform(before)!==platform(after):stableJson(before[field])!==stableJson(after[field])).map(field=>({field,before:before[field]??null,after:after[field]??null}))}
export function summarizeCreativeFeedback(rows:any[]){
 const fields:Record<string,number>={},reasons:Record<string,number>={},edited=new Set<string>(),reviewed=new Set<string>()
 for(const row of rows){const input=row.input||{};if(input.actor?.type!=='HUMAN'||row.version===0)continue;const id=input.creativeId;reviewed.add(id);const changes=input.changes||[];if(changes.length)edited.add(id);for(const field of new Set<string>(changes.map((v:any)=>v.field)))fields[field]=(fields[field]||0)+1;for(const reason of new Set<string>(input.feedback?.reasons||[]))reasons[reason]=(reasons[reason]||0)+1}
 return {reviewedScripts:reviewed.size,editedScripts:edited.size,fields,reasons,note:'字段计数和原因计数按修改版本统计；历史缺少差异的版本不推断为直接采用。'}
}
