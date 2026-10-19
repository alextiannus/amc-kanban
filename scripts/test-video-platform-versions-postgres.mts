import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {videoPlatformVersion} from '../src/lib/videoPlatformVersions'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const brandId='video-version-'+randomUUID(),userId=brandId+'-owner',parentId=brandId+'-parent'
try{
 await prisma.user.create({data:{id:userId,email:userId+'@example.test',password:'test-only-not-a-credential',type:'HUMAN',status:'ACTIVE',role:'ADMIN'}})
 await prisma.brand.create({data:{id:brandId,name:'TEST ONLY language versions'}})
 await prisma.brandKnowledge.create({data:{brandId,market:'ID',negPrompts:[]}})
 await prisma.videoProductionJob.create({data:{id:parentId,brandId,createdBy:userId,title:'TEST ONLY',platform:'xiaohongshu',idea:'confirmed script',status:'completed',finalVideoUrl:'https://example.test/fixture.mp4',scenes:[],plan:{_mmVideoJob:{language:'zh',editor:{script:'confirmed',language:'zh'}}}}})
 const request={action:'claimVariant',jobId:parentId,platform:'tiktok'}
 await assert.rejects(videoPlatformVersion('foreign',brandId,request),/video_not_found/)
 const plans=await Promise.all(Array.from({length:8},()=>videoPlatformVersion(userId,brandId,request)))
 assert.equal(plans.filter(p=>(p as any).execute).length,1)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:'VIDEO_PLATFORM_VERSION'}}),1)
 assert(plans.every((p:any)=>p.language==='id'))
 const key=(plans[0] as any).key,childId=brandId+'-child'
 await prisma.videoProductionJob.create({data:{id:childId,brandId,createdBy:userId,title:'TEST ONLY Indonesian',platform:'tiktok',idea:'Naskah',status:'generating',scenes:[],plan:{_mmVideoJob:{language:'id',editor:{script:'Naskah',variantRootJobId:parentId,variantParentJobId:parentId,variantKey:key}}}}})
 const recovered:any=await videoPlatformVersion(userId,brandId,request);assert.equal(recovered.jobId,childId);assert.equal(recovered.execute,false)
 await videoPlatformVersion(userId,brandId,{action:'completeVariant',jobId:parentId,key,childJobId:childId})
 const list:any=await videoPlatformVersion(userId,brandId,{action:'variants',jobId:childId});assert.equal(list.rootId,parentId);assert.equal(list.versions.length,1);assert.equal(list.versions[0].jobId,childId)
 const initial:any=await videoPlatformVersion(userId,brandId,{action:'variantPlan',jobId:childId,platform:'xiaohongshu'});assert.equal(initial.jobId,parentId);assert.equal(initial.execute,false)
 assert.equal((await prisma.videoProductionJob.findUnique({where:{id:parentId}}))?.finalVideoUrl,'https://example.test/fixture.mp4')
 console.log('PASS real PostgreSQL: 8 concurrent version choices admit once; receipt recovery after lost response, owner isolation, child/root navigation and original render retention')
}finally{await prisma.brandMarketingSolution.deleteMany({where:{brandId}});await prisma.videoProductionJob.deleteMany({where:{brandId}});await prisma.brandKnowledge.deleteMany({where:{brandId}});await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}});await prisma.$disconnect()}
