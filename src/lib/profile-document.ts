import {interviewDocumentBody} from './brand-interview-document'
import {brandInformationText} from './brand-information-document'
import {getBrandPlanningContext} from './brand-plan/service'
import {marketingPlanMarkdown} from './ai-native/planning-workspace-contract'
export const PROFILE_SECTIONS=['brand_information','interview','marketing_plan'] as const
export type ProfileSection=typeof PROFILE_SECTIONS[number]
export function isProfileSection(value:unknown):value is ProfileSection{return PROFILE_SECTIONS.includes(value as ProfileSection)}
function projectProfileDocument(data:NonNullable<Awaited<ReturnType<typeof getBrandPlanningContext>>>,section:ProfileSection){
 const workspace=data.marketingSolution as any,saved=workspace.coCreation?.[section]
 let content=section==='brand_information'?brandInformationText(data.brandInformation):section==='interview'?(data.merchantInterview?.rawNotes||data.merchantInterview?.summary||saved?.content||''):(saved?.content||workspace.marketingPlan?.content||'')
 if(section==='interview')content=interviewDocumentBody(content)
 if(section==='marketing_plan'&&!content&&workspace.marketingPlan?.strategyDirection?.length)content=marketingPlanMarkdown(workspace.marketingPlan,false)
 return {section,content,revision:data.marketingSolutionRevision,expectedInterviewId:data.merchantInterview?.id||null,updatedAt:saved?.updatedAt||null,attachmentIds:saved?.attachmentIds||[],startMonth:workspace.marketingPlan?.planningStartMonth||new Date().toISOString().slice(0,7)}
}

export async function readProfileDocument(brandId:string,section:ProfileSection){
 const data=await getBrandPlanningContext(brandId);return data?projectProfileDocument(data,section):null
}
export async function readProfileDocuments(brandId:string){
 const data=await getBrandPlanningContext(brandId);return data?Object.fromEntries(PROFILE_SECTIONS.map(section=>[section,projectProfileDocument(data,section)])):null
}
