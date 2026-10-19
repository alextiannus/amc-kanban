import {createHash} from 'node:crypto'
/** Deliberately excludes tool inputs, outputs, error bodies and model reasoning. */
export function inspectAssistantHistory(calls:readonly any[],references:readonly any[],artifactPath:string){
 const context=calls.find(c=>c.capability==='amc.context'&&c.status==='succeeded')?.result
 const skill=context?.planningContext?.skill
 const tools=calls.filter(c=>typeof c.capability==='string').slice(-100).map(c=>({name:c.capability,status:c.status}))
 const skills=typeof skill?.id==='string'&&typeof skill.content==='string'?[{id:skill.id,digest:createHash('sha256').update(skill.content).digest('hex')}]:[]
 for(const call of calls){if(call.capability==='assistant.skills.read'&&call.status==='succeeded'&&typeof call.input?.id==='string'&&!skills.some(s=>s.id===call.input.id))skills.push({id:call.input.id,digest:typeof call.result?.skillVersion==='string'?call.result.skillVersion:''})}
 const artifacts=references.filter(ref=>ref?.path===artifactPath&&Number.isSafeInteger(ref.revision)&&typeof ref.digest==='string').map(ref=>({path:ref.path,revision:ref.revision,digest:ref.digest}))
 return {tools,toolsTruncated:calls.length>100,skills,artifacts,preference:context?.workingPreference?{status:context.workingPreference.status,revision:context.workingPreference.revision}:null}
}
export function inspectAssistantUsage(usage:any){
 const count=(value:unknown)=>typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)?value:typeof value==='number'&&Number.isFinite(value)&&value>=0?String(value):null
 return {requests:count(usage?.requests),pending:count(usage?.pending),providerTokens:count(usage?.providerTokens),platformUnits:count(usage?.platformUnits),complete:usage?.complete===true}
}
