import {prisma} from './prisma'
import {canUserAccessBrand} from './user-management/brandAccess'
import {requireActorPermission} from './role-permissions/delegation'
import {pinVideoEditor,editorForLibrary} from './videoLineage'
export async function readVideoLineage(userId:string,brandId:string,input:any) {
  const user=await prisma.user.findUnique({where:{id:userId},select:{status:true}})
  if(user?.status!=='ACTIVE'||!await canUserAccessBrand(brandId,userId,'WRITE'))throw Object.assign(new Error('not_found'),{status:404})
  await requireActorPermission(userId,'content.video-making.create',brandId)
  if(input?.creativeId&&!input.creativeRevisionId&&input.originVideoJobId){
    const original=await prisma.videoProductionJob.findUnique({where:{id:input.originVideoJobId}})
    if(!original||original.brandId!==brandId||original.createdBy!==userId||original.creativeId!==input.creativeId)throw Object.assign(new Error('video_lineage_not_found'),{status:404})
    const previous=(original.plan as any)?._mmVideoJob?.editor
    if(previous?.creativeRevisionId)throw Object.assign(new Error('video_lineage_immutable'),{status:409})
    const assets=await prisma.mediaAsset.findMany({where:{brandId,id:{in:original.assetIds||[]}},select:{id:true,url:true,mimeType:true,aiCaption:true}})
    return pinVideoEditor(prisma,brandId,input,editorForLibrary(original,(original.assetIds||[]).flatMap((id:string)=>assets.filter((asset:{id:string})=>asset.id===id))))
  }
  return pinVideoEditor(prisma,brandId,input)
}
