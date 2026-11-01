import {prisma} from './prisma'
import {projectBrandInformation} from './brand-information'
import {readProfileWorkspace} from './profile-workspace-read'
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

/** Overview only: no full workspace or edit revision. Editors use readProfileDocument. */
export async function readProfileOverviewDocuments(brandId:string){
 const [brand,workspace]=await Promise.all([
  prisma.brand.findUnique({where:{id:brandId},select:{
   id:true,name:true,description:true,industry:true,location:true,address:true,phone:true,website:true,
   knowledge:{select:{market:true,district:true,businessHours:true,stores:true,menuItems:true,negPrompts:true,researchReport:true}},
   growthResearchSnapshots:{select:{report:true,sourceVersion:true},orderBy:{generatedAt:'desc'},take:1},
   brandPlanInterviews:{select:{id:true,rawNotes:true,summary:true,answers:true,completedAt:true},orderBy:{completedAt:'desc'},take:1}
  }}),readProfileWorkspace(brandId)
 ])
 if(!brand)return null
 const legacy=workspace.brandPlan||{},current=workspace.marketingSolution||{}
 // Mirror the existing top-level workspace merge, including absent legacy fields.
 const merged={...legacy,...current}
 const source={...brand,knowledge:{...brand.knowledge,marketingSolution:current}}
 const context={brandInformation:projectBrandInformation(source,brand.brandPlanInterviews[0],brand.growthResearchSnapshots[0]),marketingSolution:merged,marketingSolutionRevision:'',merchantInterview:brand.brandPlanInterviews[0]||null}
 return Object.fromEntries(PROFILE_SECTIONS.map(section=>{const {revision,...document}=projectProfileDocument(context as any,section);return [section,document]}))
}
