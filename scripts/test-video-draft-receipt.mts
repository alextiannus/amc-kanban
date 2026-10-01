import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {videoDraftReceipt} from '../src/lib/videoDraftReceipt.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const id='video-receipt-'+randomUUID(),url='https://example.invalid/video.mp4'
try {
 await prisma.brand.create({data:{id,name:id}})
 await prisma.socialAccount.create({data:{id,brandId:id,platformId:'instagram',handle:'fixture'}})
 await prisma.videoProductionJob.create({data:{id,brandId:id,title:id,platform:'instagram',idea:'fixture',status:'completed',finalVideoUrl:url,scenes:[]}})
 const save=()=>prisma.$transaction(async tx=>{const receipt=await videoDraftReceipt(tx,id,id,[url]);assert(!('error' in receipt));if(receipt.existingId)return receipt.existingId;return (await tx.contentDraft.create({data:{brandId:id,accountId:id,caption:'Reviewed caption',status:'draft',mediaUrls:[url],agentNote:receipt.marker}})).id})
 const receipts=await Promise.all(Array.from({length:6},save));assert.equal(new Set(receipts).size,1)
 await prisma.contentDraft.update({where:{id:receipts[0]},data:{caption:'User edited text'}})
 assert.equal(await save(),receipts[0]);assert.equal((await prisma.contentDraft.findUniqueOrThrow({where:{id:receipts[0]}})).caption,'User edited text')
 assert.equal((await prisma.$transaction(tx=>videoDraftReceipt(tx,'other',id,[url])) as any).status,404)
 assert.equal((await prisma.$transaction(tx=>videoDraftReceipt(tx,id,id,['https://example.invalid/forged.mp4'])) as any).status,409)
 await prisma.videoProductionJob.update({where:{id},data:{finalVideoUrl:url+'?v=2'}})
 assert.equal((await prisma.$transaction(tx=>videoDraftReceipt(tx,id,id,[url+'?v=2'])) as any).status,409)
 console.log('PASS: six concurrent saves produce one draft, edited caption retained, brand isolation, output binding and explicit regenerated-media review')
}finally{await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
