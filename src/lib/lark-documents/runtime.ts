import {prisma} from '../prisma'
import {principalFromUser} from '../auth-v2/types'
import {allows} from '../role-permissions/store'
import {canUserAccessBrand} from '../user-management/brandAccess'
import {decryptSecret} from '../model-management/secrets'
import {LarkProvider,LarkError} from './provider'
import {LarkStore} from './store'
import {createLarkService} from './service'

export const larkDocuments=createLarkService({
  store:new LarkStore(prisma),provider:new LarkProvider(),
  authorize:async(actor,brandId,write)=>{
    const user=await prisma.user.findUnique({where:{id:actor.userId},include:{businessRoles:true,owner:{include:{businessRoles:true}}}})
    if(!user||user.status!=='ACTIVE'||user.authVersion!==actor.authVersion)throw new LarkError('AUTH_REVOKED',401)
    const principal=principalFromUser(user,'session')
    if(!await allows(principal,write?'brand.update':'brand.read')||!await canUserAccessBrand(brandId,actor.userId,write?'WRITE':'READ'))throw new LarkError('LARK_BRAND_ACCESS_DENIED',403)
  },
  app:async brandId=>{
    const brand=await prisma.brand.findUnique({where:{id:brandId},select:{larkAppId:true,larkAppSecret:true}})
    if(!brand?.larkAppId||!brand.larkAppSecret)return null
    return {appId:brand.larkAppId,appSecret:brand.larkAppSecret.startsWith('v1.')?decryptSecret(brand.larkAppSecret):brand.larkAppSecret}
  },
})
