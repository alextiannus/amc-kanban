import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {saveVideoToLibrary} from '../src/lib/videoLibrary.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const id='video-library-test-'+randomUUID()
try{
 await prisma.user.create({data:{id,email:id+'@example.invalid',password:'test',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:id,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await prisma.mediaAsset.create({data:{id,brandId:id,url:'https://example.invalid/source.jpg',mimeType:'image/jpeg'}})
 await prisma.videoProductionJob.create({data:{id,brandId:id,title:'Video',idea:'Original script',status:'completed',platform:'instagram',scenes:[],assetIds:[id],finalVideoUrl:'https://example.invalid/final.mp4',plan:{_mmVideoJob:{editor:{script:'Reviewed script',templateId:'template',targetDurationSec:12}}}}})
 const saved=await Promise.all(Array.from({length:6},()=>saveVideoToLibrary(id,id,{videoJobId:id})))
 assert.equal(new Set(saved.map(s=>s.asset.id)).size,1)
 const first=saved[0].asset
 assert.equal((first.technicalMetadata as any).videoDraft.editor.script,'Reviewed script')
 assert.equal((first.technicalMetadata as any).videoDraft.editor.assets[0].id,id)
 assert.equal((first.technicalMetadata as any).videoDraft.editor.targetDurationSec,12)
 await prisma.mediaAsset.update({where:{id:first.id},data:{aiTags:['user-tag']}})
 assert.deepEqual((await saveVideoToLibrary(id,id,{videoJobId:id})).asset.aiTags,['user-tag'])
 await prisma.videoProductionJob.update({where:{id},data:{finalVideoUrl:'https://example.invalid/revised.mp4',plan:{_mmVideoJob:{editor:{script:'Revised script'}}}}})
 const second=await saveVideoToLibrary(id,id,{videoJobId:id});assert.notEqual(first.id,second.asset.id)
 const original=await prisma.mediaAsset.findUniqueOrThrow({where:{id:first.id}})
 assert.equal((original.technicalMetadata as any).videoDraft.editor.script,'Reviewed script')
 assert.equal(original.url,'https://example.invalid/final.mp4')
 await assert.rejects(()=>saveVideoToLibrary(id,id,{videoJobId:'other-brand-job'}),(e:any)=>e.status===404)
 await prisma.videoProductionJob.update({where:{id},data:{status:'generating'}})
 await assert.rejects(()=>saveVideoToLibrary(id,id,{videoJobId:id}),(e:any)=>e.status===409)
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 await assert.rejects(()=>saveVideoToLibrary(id,id,{videoJobId:id}),(e:any)=>[403,404].includes(e.status))
 console.log('PASS: concurrent once-only library save, original inputs retained, regenerated version preserves original, edits preserved, incomplete jobs rejected and access revocation enforced')
}finally{await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}});await prisma.$disconnect()}
