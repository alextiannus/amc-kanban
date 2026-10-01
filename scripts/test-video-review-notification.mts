import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {notifyVideoReview} from '../src/lib/notification/videoReview.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const id='video-review-'+randomUUID(),brand=id+'-brand',job=id+'-job',other=id+'-other'
try {
 for(const uid of [id,other])await prisma.user.create({data:{id:uid,email:uid+'@example.invalid',password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id:brand,name:'Review test',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await prisma.videoProductionJob.create({data:{id:job,brandId:brand,title:'Test',platform:'tiktok',idea:'Test',status:'generating',scenes:[]}})
 await assert.rejects(()=>notifyVideoReview(id,{videoJobId:job}),{code:'video_not_ready'})
 await prisma.videoProductionJob.update({where:{id:job},data:{status:'completed',finalVideoUrl:'https://example.invalid/video.mp4'}})
 await assert.rejects(()=>notifyVideoReview(other,{videoJobId:job}),{code:'not_found'})
 const results=await Promise.all([notifyVideoReview(id,{videoJobId:job}),notifyVideoReview(id,{videoJobId:job})])
 assert.equal(results[0].notification.id,results[1].notification.id)
 assert.equal(results[0].notification.userId,id)
 assert.match(results[0].notification.actionUrl!,/action=video_review/)
 await prisma.notification.update({where:{id:results[0].notification.id},data:{status:'READ'}})
 assert.equal((await notifyVideoReview(id,{videoJobId:job})).notification.status,'READ')
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 await assert.rejects(()=>notifyVideoReview(id,{videoJobId:job}),{code:'not_found'})
 console.log('PASS: ready-only own inbox, concurrent idempotency, read retained, cross-brand isolation and immediate revocation')
} finally {
 await prisma.brand.deleteMany({where:{id:brand}})
 await prisma.user.deleteMany({where:{id:{in:[id,other]}}})
 await prisma.$disconnect()
}
