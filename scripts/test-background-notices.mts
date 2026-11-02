import {ensurePushSchema,updatePush,deliverPushNotices,validateSubscription,quietNow} from '../src/lib/notification/push'
import {createECDH,randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma'
import {ensureBackgroundNoticeSchema} from '../src/lib/notification/background-schema'
import {processBackgroundNotices} from '../src/lib/notification/background'
import {backgroundOutcome} from '../src/lib/notification/background-policy'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
assert.equal(backgroundOutcome('video',{status:'completed'}),null)
assert.equal(backgroundOutcome('video',{status:'processing',error:'retrying'}),null)
assert.equal(backgroundOutcome('video',{status:'completed',finalVideoUrl:'https://fixture/video.mp4'}),'completed')
assert.equal(backgroundOutcome('ai',{status:'succeeded',durationMs:3000,resultReady:true}),'silent')
assert.equal(backgroundOutcome('ai',{status:'waiting',waitingReason:'external_result'}),null)
assert.equal(backgroundOutcome('ai',{status:'waiting',waitingReason:'input'}),'attention')
assert.equal(backgroundOutcome('insight',{status:'completed',reportReady:false}),null)
assert.equal(backgroundOutcome('publish',{status:'SUCCEEDED',draftStatus:'scheduled',postId:'post'}),null)
assert.equal(backgroundOutcome('publish',{status:'RESULT_UNKNOWN',draftStatus:'publishing'}),null)
await ensureBackgroundNoticeSchema()
const id=randomUUID(),other=randomUUID(),brand=randomUUID(),oldDate=new Date('2020-01-01')
try{
 await prisma.user.create({data:{id,email:id+'@fixture.test',password:'fixture-only',role:'ADMIN',status:'ACTIVE'}})
 await prisma.user.create({data:{id:other,email:other+'@fixture.test',password:'fixture-only',role:'BRAND_OWNER',status:'ACTIVE'}})
 await prisma.brand.create({data:{id:brand,name:'Notice fixture',ownerId:id}})
 const video=(key:string,status:string,createdBy=id,extra:any={})=>prisma.videoProductionJob.create({data:{id:key,brandId:brand,createdBy,title:'Fixture',platform:'test',idea:'Fixture',scenes:[],status,...extra}})
 await video('old','completed',id,{finalVideoUrl:'https://fixture/old.mp4',createdAt:oldDate,updatedAt:oldDate})
 await video('ready','completed',id,{finalVideoUrl:'https://fixture/ready.mp4'})
 await video('missing-file','completed')
 await video('retrying','generating')
 await video('failed','failed')
 await video('cancelled','cancelled')
 await video('denied','completed',other,{finalVideoUrl:'https://fixture/denied.mp4'})
 await video('aggregate','generating',id,{scenes:[{status:'completed'},{status:'failed'}]})
 const draft=await prisma.contentDraft.create({data:{brandId:brand,caption:'Fixture',status:'scheduled',platformPostId:'real-provider-id'}})
 await prisma.postfastDeliveryJob.create({data:{id:'publishing',brandId:brand,draftId:draft.id,submissionKey:'fixture',status:'SUCCEEDED',payload:{actorId:id}}})
 await prisma.brandKnowledge.create({data:{brandId:brand,marketingSolution:{insightRequest:{id:'research',userId:id,status:'failed',createdAt:new Date().toISOString()}}}})
 // Concurrent processes must deliver one record; even without a browser.
 await Promise.all([processBackgroundNotices(),processBackgroundNotices()])
 let notices=await prisma.notification.findMany({where:{userId:id}})
 assert.equal(notices.length,3);assert.equal(notices.filter(n=>n.type==='BACKGROUND_COMPLETED').length,1)
 assert.equal(await prisma.notification.count({where:{userId:other}}),0)
 const completed=notices.find(n=>n.type==='BACKGROUND_COMPLETED')!
 await prisma.notification.update({where:{id:completed.id},data:{status:'READ'}})
 await prisma.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()`)
 await processBackgroundNotices()
 assert.equal((await prisma.notification.findUnique({where:{id:completed.id}}))!.status,'READ')
 assert.equal(await prisma.notification.count({where:{userId:id}}),3)
 // The whole video, not each child scene, triggers one completion.
 await prisma.videoProductionJob.update({where:{id:'aggregate'},data:{status:'completed',finalVideoUrl:'https://fixture/whole.mp4'}})
 await prisma.contentDraft.update({where:{id:draft.id},data:{status:'published'}})
 await prisma.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()`)
 await processBackgroundNotices()
 assert.equal(await prisma.notification.count({where:{userId:id}}),5)
 // Explicit retry after final failure can later notify success; automatic repeats do not reset old read status.
 await prisma.videoProductionJob.update({where:{id:'failed'},data:{status:'generating'}});await processBackgroundNotices()
 await prisma.videoProductionJob.update({where:{id:'failed'},data:{status:'completed',finalVideoUrl:'https://fixture/recovered.mp4'}})
 await prisma.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()`);await processBackgroundNotices()
 assert.equal(await prisma.notification.count({where:{userId:id,type:'BACKGROUND_COMPLETED'}}),4)
 assert.equal(await prisma.notification.count({where:{userId:id,type:'BACKGROUND_FAILED',status:'DISMISSED'}}),1)

 // Real source query for both AI runtime lanes; short conversation is silent.
 await prisma.$executeRawUnsafe(`CREATE SCHEMA amc_iaic`)
 await prisma.$executeRawUnsafe(`CREATE TABLE amc_iaic.amc_ai_requests(task_id uuid,scope_id text,subject_id text,runtime_lane text,intent jsonb,created_at timestamptz DEFAULT now(),planning_result jsonb)`)
 for(const [lane,schema] of [['default','amc_iaic'],['conversation','amc_iaic_conversation']]){
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  await prisma.$executeRawUnsafe(`CREATE TABLE ${schema}.iaic_tasks(id uuid,erp_user text,employee_id text,status text,waiting_reason text,updated_at timestamptz DEFAULT now(),result jsonb)`)
  for(const state of ['failed','waiting','succeeded']){
   const tid=randomUUID()
   await prisma.$executeRawUnsafe(`INSERT INTO amc_iaic.amc_ai_requests(task_id,scope_id,subject_id,runtime_lane,intent) VALUES($1::uuid,$2,$3,$4,$5::jsonb)`,tid,brand,id,lane,JSON.stringify({brandId:brand,kind:'conversation',conversationId:'original-conversation'}))
   await prisma.$executeRawUnsafe(`INSERT INTO ${schema}.iaic_tasks(id,erp_user,employee_id,status,waiting_reason,result) VALUES($1::uuid,$2,$3,$4,$5,'{}')`,tid,id,brand,state,state==='waiting'?'input':null)
  }
 }
 const aiBefore=await prisma.notification.count({where:{userId:id}})
 await processBackgroundNotices()
 assert.equal(await prisma.notification.count({where:{userId:id}}),aiBefore+4)
 const aiNotice=await prisma.notification.findFirst({where:{userId:id,type:'BACKGROUND_ATTENTION'}})
 assert(aiNotice?.actionUrl?.includes('conversationId=original-conversation'))
 await prisma.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()`);await processBackgroundNotices()
 assert.equal(await prisma.notification.count({where:{userId:id}}),aiBefore+4)
 // Direct, already-approved scheduled post also follows actual publication.
 const direct=await prisma.contentDraft.create({data:{brandId:brand,caption:'Direct scheduled',status:'scheduled',platformPostId:'direct-post',actionItem:{create:{brandId:brand,type:'content_approval',title:'Publish',description:'Fixture',status:'approved',resolvedBy:id,resolvedAt:new Date()}}}})
 await processBackgroundNotices();assert.equal(await prisma.notification.count({where:{userId:id}}),aiBefore+4)
 await prisma.contentDraft.update({where:{id:direct.id},data:{status:'published'}})
 await prisma.$executeRawUnsafe(`UPDATE amc_background_notice_watch SET next_check_at=now()`);await processBackgroundNotices()
 assert.equal(await prisma.notification.count({where:{userId:id}}),aiBefore+5)

 process.env.MODEL_CONFIG_ENCRYPTION_KEY='11'.repeat(32)
 await ensurePushSchema()
 const ecdh=createECDH('prime256v1');ecdh.generateKeys()
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/fixture-only',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}
 assert.throws(()=>validateSubscription({...subscription,endpoint:'http://127.0.0.1/internal'}))
 assert.throws(()=>validateSubscription({...subscription,endpoint:'https://fcm.googleapis.com.attacker.test/push'}))
 assert(quietNow({quiet:true,timezone:'Asia/Singapore'},new Date('2026-11-02T15:00:00Z')))
 assert(!quietNow({quiet:true,timezone:'Asia/Singapore'},new Date('2026-11-02T04:00:00Z')))
 await updatePush(id,{action:'subscribe',subscription});await updatePush(id,{action:'preferences',quiet:false})
 const encrypted:any[]=await prisma.$queryRawUnsafe(`SELECT subscription FROM amc_push_devices`)
 assert(!encrypted[0].subscription.includes('fcm.googleapis.com'))
 const beforePush=await prisma.notification.create({data:{userId:id,brandId:brand,type:'BACKGROUND_COMPLETED',title:'Fixture ready',message:'Ready',actionUrl:'/dashboard?brandId='+brand+'&action=video_review&jobId=ready'}})
 const sent:any[]=[]
 const send=async(...args:any[])=>{sent.push(args);return {statusCode:201,body:'',headers:{}}}
 await Promise.all([deliverPushNotices(prisma,send as any),deliverPushNotices(prisma,send as any)])
 assert.equal(sent.length,1);assert(JSON.parse(sent[0][1]).url.includes('noticeId='+beforePush.id));assert.equal(sent[0][2].TTL,3600)
 await deliverPushNotices(prisma,send as any);assert.equal(sent.length,1)
 await prisma.$executeRawUnsafe(`UPDATE amc_push_preferences SET last_sent_at=NULL,last_seen_at=now()`)
 await prisma.notification.create({data:{userId:id,brandId:brand,type:'BACKGROUND_FAILED',title:'Fixture failed',message:'Needs action'}})
 await deliverPushNotices(prisma,send as any);assert.equal(sent.length,1,'active AMC session suppresses system push')
 await updatePush(id,{action:'preferences',muted:true});await prisma.$executeRawUnsafe(`UPDATE amc_push_preferences SET last_sent_at=NULL,last_seen_at=NULL`)
 await deliverPushNotices(prisma,send as any);assert.equal(sent.length,1,'pause suppresses system push')
 await updatePush(id,{action:'unsubscribe',subscription})
 assert.equal((await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM amc_push_devices`) as any[])[0].n,0)
 console.log('PASS: encrypted Web Push subscription, endpoint validation, provider adapter, recipient grouping, concurrent send dedupe, foreground suppression, quiet hours, pause and unsubscribe. No real push sent.')
 console.log('PASS: durable background delivery, whole-video aggregation, real published state, report failure, retries, concurrent dedupe, read preservation, historical exclusion and revoked access; no browser/provider needed.')
}finally{await prisma.brand.delete({where:{id:brand}}).catch(()=>{});await prisma.user.deleteMany({where:{id:{in:[id,other]}}});await prisma.$disconnect()}
