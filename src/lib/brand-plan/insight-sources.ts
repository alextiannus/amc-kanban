import type {MediaAsset} from '@prisma/client'
import {createHash} from 'node:crypto'
import {prisma} from '../prisma'
import {readGrowthInsightSources,writeGrowthInsightSources} from '../growthDataCenter'
const hash=(v:string)=>createHash('sha256').update(v).digest('hex').slice(0,24)
async function sourceIdentity(brandId:string){
 const brand=await prisma.brand.findUnique({where:{id:brandId},include:{knowledge:true,accounts:{where:{unboundAt:null},select:{platformId:true,profileUrl:true}}}})
 if(!brand)throw Object.assign(Error('brand_not_found'),{statusCode:404})
 const latest=await prisma.brandGrowthResearchSnapshot.findFirst({where:{brandId,source:'amc-growth'},orderBy:{generatedAt:'desc'},select:{report:true}})
 const seed:any[]=[]
 const add=(kind:string,title:string,url:string,notes='')=>{if(url||notes)seed.push({id:'source-'+hash(kind+url+title),kind,title,url,notes:notes.slice(0,4000)})}
 add('website','官网',brand.website||'');add('google_maps','Google 商家页面',brand.googleBusinessUrl||brand.googleReviewUrl||'')
 for(const a of brand.accounts){const kind=a.platformId.toLowerCase().replace(/[_-]/g,'');if(['instagram','facebook','tiktok','xiaohongshu'].includes(kind))add(kind,a.platformId,a.profileUrl||'')}
 const k=brand.knowledge
 const notes=[brand.description&&`品牌介绍：${brand.description}`,brand.address&&`地址：${brand.address}`,k?.audienceAssumptions&&`目标客户：${k.audienceAssumptions}`,k?.productAssumptions&&`产品与卖点：${k.productAssumptions}`,k?.brandTone&&`品牌语气：${k.brandTone}`,k?.businessHours&&`营业时间：${k.businessHours}`,k?.negPrompts?.length&&`忌讳词汇与说法：${k.negPrompts.join('；')}`].filter(Boolean).join('\n')
 add('brand_info','品牌资料','',notes)
 const interview=(k?.marketingSolution as any)?.coCreation?.interview
 if(interview?.status==='confirmed'&&interview.content)add('brand_info','已确认品牌定位','',interview.content)
 const assets=await prisma.mediaAsset.findMany({where:{brandId,OR:[{technicalMetadata:{path:['insightSource'],equals:true}},{technicalMetadata:{path:['planningAttachment'],equals:true}}]},orderBy:{createdAt:'desc'},take:20})
 for(const a of assets)seed.push({id:'source-'+hash(a.id),kind:'file',title:a.filename||'上传资料',url:a.url,notes:'',attachmentId:a.id,filename:a.filename,mimeType:a.mimeType,contentHash:a.contentHash||'',extractedText:a.mimeType?.startsWith('text/')?(a.aiCaption||'').slice(0,12000):''})
 return {sourceKey:'amc-kanban-'+brandId,externalBrandId:brandId,brandKey:brand.growthBrandKey||(latest?.report as any)?.growthBrandKey||undefined,brandName:brand.name,market:brand.location||brand.address||'Singapore',seed}
}
export async function readInsightSources(brandId:string,reportVersion?:string){if(reportVersion&&!/^\d+$/.test(reportVersion))throw Object.assign(Error('invalid_report_version'),{statusCode:400});return readGrowthInsightSources({...await sourceIdentity(brandId),reportVersion})}
export async function saveInsightSources(brandId:string,userId:string,input:any){
 if(!input||!/^[a-f0-9]{64}$/.test(input.expectedRevision||'')||!Array.isArray(input.sources)||input.sources.length>60)throw Object.assign(Error('invalid_sources'),{statusCode:400})
 const identity=await sourceIdentity(brandId),ids=input.sources.filter((s:any)=>s?.kind==='file').map((s:any)=>s.attachmentId)
 if(ids.some((v:unknown)=>typeof v!=='string')||ids.length>20)throw Object.assign(Error('invalid_attachments'),{statusCode:400})
 const assets:MediaAsset[]=await prisma.mediaAsset.findMany({where:{brandId,id:{in:ids}}});const byId=new Map<string,MediaAsset>(assets.map(a=>[a.id,a]))
 const sources=input.sources.map((s:any)=>{if(s?.kind!=='file')return {id:s?.id,kind:s?.kind,title:s?.title,url:s?.url,notes:s?.notes};const a=byId.get(s.attachmentId);if(!a)throw Object.assign(Error('attachment_not_found'),{statusCode:404});return {id:s.id,kind:'file',title:s.title,notes:s.notes,url:a.url,attachmentId:a.id,filename:a.filename,mimeType:a.mimeType,contentHash:a.contentHash||'',extractedText:a.mimeType?.startsWith('text/')?(a.aiCaption||'').slice(0,12000):''}})
 const value=await writeGrowthInsightSources({...identity,expectedRevision:input.expectedRevision,reportVersion:/^\d+$/.test(String(input.reportVersion||''))?String(input.reportVersion):null,sources,actorId:userId})
 await prisma.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'INSIGHT_SOURCES_UPDATED',resourceType:'Brand',resourceId:brandId,metadata:{revision:value.revision,previousRevision:input.expectedRevision,sourceIds:value.sources.map((s:any)=>s.id)}}})
 return value
}
