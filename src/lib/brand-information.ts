import type {Prisma} from '@prisma/client'
import {createHash} from 'node:crypto'
import {prisma} from './prisma'
export const BRAND_INFORMATION_FIELDS=['name','description','location','address','phone','website','industry'] as const
export const brandInformationSelect={id:true,name:true,description:true,location:true,address:true,phone:true,website:true,industry:true} as const
export function brandInformationRevision(value:any){return createHash('sha256').update(JSON.stringify(BRAND_INFORMATION_FIELDS.map(key=>value?.[key]??null))).digest('hex')}
const excerpt=(value:unknown,limit:number)=>{const content=typeof value==='string'?value:JSON.stringify(value??'');return {content:content.length>limit?content.slice(0,Math.floor(limit*.7))+'\n[excerpt]\n'+content.slice(-Math.floor(limit*.3)):content,partial:content.length>limit}}
export function projectBrandInformation(brand:any,interview?:any,report?:any){
 const knowledge=brand?.knowledge||{},profile=Object.fromEntries(['id',...BRAND_INFORMATION_FIELDS].map(key=>[key,brand?.[key]??null]))
 const notes=interview?.rawNotes||interview?.summary||interview?.answers
 const research=report?.report||report||knowledge.researchReport
 const summary=research?.summary||research?.structuredReport?.executive_summary||research?.reportMarkdown
 return {...profile,revision:brandInformationRevision(brand),market:knowledge.market||brand?.location||null,district:knowledge.district||null,businessHours:knowledge.businessHours||null,stores:knowledge.stores||[],menuItems:knowledge.menuItems||[],restrictions:knowledge.negPrompts||[],...(notes?{merchantInformation:{source:'brand_interview',...excerpt(notes,7000),status:'Merchant statements; preserve scope and unconfirmed qualifiers'}}:{}),...(summary?{researchInformation:{source:'AI Insight Report',version:research.reportVersionId||report?.sourceVersion||research.snapshotId||null,...excerpt(summary,4000),status:'Research observations, not independently verified merchant facts; conflicts remain explicit'}}:{}),usage:'Current unified Brand Information. Report and interview enrich it; neither is required. Use this and the user conversation to plan; trace original evidence only when needed.'}
}
export async function readBrandInformation(brandId:string){
 const [brand,interview,report]=await Promise.all([
  prisma.brand.findUnique({where:{id:brandId},select:{...brandInformationSelect,knowledge:{select:{market:true,district:true,businessHours:true,stores:true,menuItems:true,negPrompts:true,researchReport:true}}}}),
  prisma.brandPlanInterview.findFirst({where:{brandId},orderBy:{completedAt:'desc'},select:{rawNotes:true,summary:true,answers:true}}),
  prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId},orderBy:{generatedAt:'desc'},select:{report:true,sourceVersion:true}}),
 ])
 return brand?projectBrandInformation(brand,interview,report):null
}
export async function updateBrandInformation(brandId:string,userId:string,patch:Record<string,string>,expectedRevision:string){
 const keys=Object.keys(patch)
 if(!keys.length||keys.some(key=>!BRAND_INFORMATION_FIELDS.includes(key as any)||typeof patch[key]!=='string'||patch[key].length>12000)||('name' in patch&&!patch.name.trim()))throw Error('invalid_brand_information_patch')
 return prisma.$transaction(async (tx:Prisma.TransactionClient)=>{
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id=${brandId} FOR UPDATE`
  const before=await tx.brand.findUnique({where:{id:brandId},select:brandInformationSelect})
  if(!before)throw Error('brand_not_found')
  if(brandInformationRevision(before)!==expectedRevision)throw Error('brand_information_changed_read_again')
  const updated=await tx.brand.update({where:{id:brandId},data:Object.fromEntries(keys.map(key=>[key,patch[key].trim()||null])),select:brandInformationSelect})
  await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'BRAND_INFORMATION_UPDATED',resourceType:'Brand',resourceId:brandId,oldValue:before,newValue:updated,metadata:{source:'ai_conversation',fields:keys}}})
  return {saved:true,verified:true,brandInformation:updated,revision:brandInformationRevision(updated)}
 })
}
