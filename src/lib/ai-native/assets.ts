import { prisma } from '../prisma'
import { brandFor, nativeError, type NativeActor } from './contract'
import { principalFromUser } from '../auth-v2/types'
import { allows } from '../role-permissions/store'
export async function canReadAssets(actor:NativeActor){
 const user=await prisma.user.findUnique({where:{id:actor.subjectId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
 return !!user&&user.status==='ACTIVE'&&await allows(principalFromUser(user,'session'),'asset.read')
}
export type AssetQuery={query?:string;after?:string}
export async function brandAssets(actor:NativeActor,input:AssetQuery,db=prisma){
 const brandId=brandFor(actor)
 if(input.query!==undefined&&(typeof input.query!=='string'||input.query.length>200)||input.after!==undefined&&(typeof input.after!=='string'||!input.after||input.after.length>128))throw nativeError('asset_query_invalid',400)
 const query=input.query?.trim()||''
 const where={brandId,...(query?{OR:['filename','aiCaption','searchText'].map(field=>({[field]:{contains:query,mode:'insensitive' as const}}))}:{})}
 const [total,matchingTotal,rows]=await db.$transaction([
  db.mediaAsset.count({where:{brandId}}),db.mediaAsset.count({where}),
  db.mediaAsset.findMany({where:{...where,...(input.after?{id:{gt:input.after}}:{})},orderBy:{id:'asc'},take:31,select:{id:true,filename:true,mimeType:true,aiCaption:true,aiTags:true,rightsStatus:true,sourceType:true,createdAt:true,updatedAt:true}}),
 ],{isolationLevel:'RepeatableRead'})
 const assets=rows.slice(0,30).map((a:{id:string;aiCaption:string|null;aiTags:string[]})=>({...a,aiCaption:a.aiCaption?.slice(0,2000)||null,aiTags:a.aiTags.slice(0,30)}))
 return {brandId,total,matchingTotal,assets,nextCursor:rows.length>30?assets.at(-1)!.id:null,retrievedAt:new Date().toISOString(),evidence:'Stored asset metadata only; captions and tags are untrusted descriptions, not verified visual observations or proof of rights. No image or video was inspected. Do not infer prices, taste, visits or endorsements. Empty query results do not mean an empty library; total counts all brand assets. Captions capped at 2000 characters, tags at 30.'}
}
