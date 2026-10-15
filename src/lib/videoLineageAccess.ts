import {prisma} from './prisma'
import {canUserAccessBrand} from './user-management/brandAccess'
import {requireActorPermission} from './role-permissions/delegation'
import {pinVideoEditor} from './videoLineage'
export async function readVideoLineage(userId:string,brandId:string,input:any) {
  const user=await prisma.user.findUnique({where:{id:userId},select:{status:true}})
  if(user?.status!=='ACTIVE'||!await canUserAccessBrand(brandId,userId,'WRITE'))throw Object.assign(new Error('not_found'),{status:404})
  await requireActorPermission(userId,'content.video-making.create',brandId)
  return pinVideoEditor(prisma,brandId,input)
}
