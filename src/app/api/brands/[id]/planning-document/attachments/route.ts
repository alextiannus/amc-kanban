import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {NextResponse} from 'next/server'
import {randomUUID,createHash} from 'node:crypto'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionWriteBrandProject} from '@/lib/brandAccess'
import {getHuaweiObsConfig,uploadHuaweiObsObject} from '@/lib/integrations/huaweiObs'
import {prisma} from '@/lib/prisma'
export const maxDuration=60
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Forbidden'},{status:403})
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionWriteBrandProject(id,auth.user.id,auth.user.type))return NextResponse.json({error:'Not found'},{status:404})
 const form=await request.formData(),file=form.get('file')
 if(!(file instanceof File)||!file.size||file.size>10_000_000)return NextResponse.json({error:'请选择不超过 10MB 的文件。'},{status:400})
 const types=['text/plain','text/markdown','application/pdf','image/jpeg','image/png','image/webp']
 const mime=file.type||(/\.md$/i.test(file.name)?'text/markdown':'')
 if(!types.includes(mime))return NextResponse.json({error:'支持 TXT、Markdown、PDF、JPG、PNG、WebP。'},{status:400})
 if(!getHuaweiObsConfig())return NextResponse.json({error:'文件存储暂不可用，请稍后重试。'},{status:503})
 const buffer=Buffer.from(await file.arrayBuffer())
 if(mime==='application/pdf'&&!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))return NextResponse.json({error:'无效 PDF 文件。'},{status:400})
 if(mime.startsWith('image/')){
  const sharp=(await import('sharp')).default
  try{const meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();if(!meta.width||!meta.height)throw Error()}catch{return NextResponse.json({error:'无法读取图片。'},{status:400})}
 }
 const extractedText=mime.startsWith('text/')?buffer.toString('utf8').slice(0,18000):null
 const uploaded=await uploadHuaweiObsObject({key:`brands/${id}/planning/${randomUUID()}`,body:buffer,contentType:mime})
 if(!uploaded.ok)return NextResponse.json({error:'上传未完成，请重试。'},{status:502})
 const asset=await prisma.mediaAsset.create({data:{brandId:id,url:uploaded.url,filename:file.name.slice(0,200),mimeType:mime,sizeBytes:buffer.length,uploadedBy:auth.user.id,assetKind:mime.startsWith('image/')?'image':'document',sourceType:'huawei_obs',contentHash:createHash('sha256').update(buffer).digest('hex'),aiCaption:extractedText,technicalMetadata:{planningAttachment:true,extractionStatus:extractedText?'extracted_unconfirmed':'pending_review'}}})
 let status=extractedText?'extracted_unconfirmed':'pending_review'
 if(mime.startsWith('image/'))try{const {createAnalysisBatch}=await import('@/lib/asset-analysis/service');const batch=await createAnalysisBatch({brandId:id,assetIds:[asset.id],batchKey:`planning-${asset.id}`,upload:true});if(batch)status='queued'}catch{/* Original attachment remains available for manual review. */}
 return NextResponse.json({id:asset.id,filename:asset.filename,extractedText,status})
}
