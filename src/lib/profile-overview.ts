import {prisma} from './prisma'
import {readProfileDocuments} from './profile-document'
import {readAvailableInsight} from './brand-plan/insight-service'
import {insightDownloads} from './brand-plan/report-download'
/** A saved-data snapshot. Never reconciles providers, generates content or writes records. */
export async function readProfileOverview(brandId:string){
 const [documents,insight,brand]=await Promise.all([
  readProfileDocuments(brandId),readAvailableInsight(brandId,{savedOnly:true}),
  prisma.brand.findUnique({where:{id:brandId},select:{id:true,name:true,description:true,address:true,phone:true,website:true,location:true,
   accounts:{where:{unboundAt:null,NOT:{handle:'unconfigured'}},orderBy:{updatedAt:'desc'},select:{id:true,platformId:true,handle:true,displayName:true,autoPilot:true,followerCount:true,followerDelta:true,ratingScore:true,snapshotAt:true,profileUrl:true,expiresAt:true}},
   knowledge:{select:{brandTone:true,audienceAssumptions:true,productAssumptions:true,businessHours:true,reservationUrl:true,orderingUrl:true,deliveryUrls:true,stores:true,market:true,district:true,publishingFreq:true,brandVoiceProfiles:true,defaultBrandVoiceProfileId:true}}
  }})
 ])
 if(!brand||!documents)return null
 const {knowledge,...profile}=brand
 return {brand:profile,knowledge:knowledge||{},documents,insight:{...insight,downloads:insightDownloads(brandId,insight.report)}}
}
