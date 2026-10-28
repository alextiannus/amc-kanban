import {prisma} from '../prisma'
import {canUserAccessBrand} from '../user-management/brandAccess'
import {fetchBrandKeywords} from '../promotion-strategy/clients'
import {brainstormTagContext} from './brainstorm-match'
import {skuFacts} from './facts'
import {nativeError} from './contract'
export async function brandKeywordsForUser(userId:string,brandId:string,input:any,db:any=prisma,call=fetchBrandKeywords){
 const write=input.action==='save'
 if(!['read','catalog','save'].includes(input.action))throw nativeError('invalid_brand_keywords',400)
 if(!await canUserAccessBrand(brandId,userId,write?'WRITE':'READ',db))throw nativeError('brand_keywords_access_denied',404)
 if(input.action==='catalog')return call({action:'catalog',brandId,q:input.q||''})
 if(write)return call({action:'save',brandId,actorId:userId,entries:input.entries,expectedRevision:input.expectedRevision})
 const facts=await db.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,industry:true,knowledge:{select:{menuItems:true,productAssumptions:true,promotionFocus:true}}}})
 if(!facts)throw nativeError('brand_context_unavailable',404)
 const [value,canEdit]=await Promise.all([call({action:'read',brandId,context:brainstormTagContext({...facts,productCatalog:skuFacts(facts.knowledge?.menuItems)},'')}),canUserAccessBrand(brandId,userId,'WRITE',db)])
 return {...value,canEdit}
}
