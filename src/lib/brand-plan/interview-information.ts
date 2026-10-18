import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {prisma} from '../prisma'
import {getBrandPlanningContext} from './service'
import {readAvailableInsight} from './insight-service'
import {planningRevision} from '../ai-native/planning-workspace-contract'
export function interviewInput(document:any){
 const provenance=document?.provenance
 if(provenance?.organizedContentHash===planningRevision(document?.content)&&provenance?.interviewInput)return provenance.interviewInput
 return {content:document?.content||'',attachmentIds:document?.attachmentIds||[]}
}
/** Refresh provider evidence before hashing; never let a cached chat session hide new sources. */
export async function readInterviewInformationSources(brandId:string,language='zh'){
 const [context,insight,skill]=await Promise.all([getBrandPlanningContext(brandId),readAvailableInsight(brandId),readFile(path.join(process.cwd(),'skills/amc-marketing-expert/SKILL.md'),'utf8')])
 if(!context)throw Object.assign(Error('brand_not_found'),{statusCode:404})
 const input=interviewInput((context.marketingSolution as any).coCreation?.interview)
 const attachments=await prisma.mediaAsset.findMany({where:{brandId,id:{in:input.attachmentIds}},orderBy:{id:'asc'},select:{id:true,filename:true,aiCaption:true,imageAnalysis:true,textDetection:true,technicalMetadata:true}})
 const skillVersion=createHash('sha256').update(skill).digest('hex'),month=new Date().toISOString().slice(0,7)
 const sourceHashes={brand:planningRevision({profile:context.brandInformation,claim:context.brandClaim}),report:planningRevision(insight.report),interview:planningRevision({latest:context.merchantInterview,input,attachments})}
 const previous=(context.marketingSolution as any).coCreation?.interview?.provenance?.sourceHashes||{}
 const changedSources=Object.keys(sourceHashes).filter(key=>previous[key]!==sourceHashes[key as keyof typeof sourceHashes])
 // Only these three inputs invalidate positioning. Skill, language, month, strategy and subscription do not.
 const sourceRevision=planningRevision(sourceHashes)
 return {sourceRevision,sourceHashes,changedSources,month,language,skillVersion,interviewInput:input,reportId:insight.report?.id||null,workspaceRevision:context.marketingSolutionRevision,sources:{reportId:insight.report?.id||null,reportDate:insight.report?.completedAt||null,reportStatus:insight.liveStatus,interviewDate:context.merchantInterview?.completedAt||null,skill:'amc-marketing-expert',skillVersion}}
}
export function interviewInformationTaskBody(source:Awaited<ReturnType<typeof readInterviewInformationSources>>,retryOf?:string){
 const hash=source.sourceRevision,session=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`
 return {kind:'conversation',topic:'brand_planning',currentPage:'brand_story',history:[],contextSessionId:session,requestKey:'interview-info-'+(retryOf?planningRevision([hash,retryOf]):hash),planningScope:{stage:'interview',mode:'draft',startMonth:source.month},goal:`使用已加载的 AMC 营销策略 Skill，统合并更新最终品牌定位。若已有定位，只针对有更新来源影响的结论做增量修订，保留未受影响的定位、结构和已确认共识，不全篇重写。必须结合 amc.context 中的现有品牌资料、planningContext.workspace.workspace.positioningInputs（完整品牌资料、最新访谈、最新用户补充和已有定位）与最新 AI Insight、最新访谈和用户补充记录及附件。已有 Skill 整理结果是派生资料，不当作新用户事实。优先保留用户最新明确修正；冲突注明来源和日期，未知不编造。品牌定位应涵盖品牌特点与定位、核心客群和场景、价值主张及差异化、主推产品、品牌个性和经营限制，并逐项保留依据与确认状态。此次变化来源：${source.changedSources.join(", ")}。只返回两个主章节：${source.language==='en'?'Current information / Information to supplement':'当前信息 / 希望补充的信息'}；第二章只列需用户补充的项目，用项目符号，不重复问已有答案，不把 AMC 采集工作交给用户。必须生成 interview planningDraft，content 为上述完整可编辑整理结果，使用 ${source.language==='en'?'English':'中文'}。不保存、不确认、不提交新调研。输入版本 ${hash}。这是一份定位更新草稿，不能宣称已获用户确认。`}
}
