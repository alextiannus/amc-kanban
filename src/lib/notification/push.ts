import webpush from 'web-push'
import {createHash} from 'node:crypto'
import {prisma} from '../prisma'
import {encryptSecret,decryptSecret} from '../model-management/secrets'
import {canUserAccessBrand} from '../user-management/brandAccess'
export async function ensurePushSchema(db:any=prisma){
 await db.$transaction(async(tx:any)=>{
  await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('amc-push-schema'))::text`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_push_keys(id integer PRIMARY KEY,public_key text NOT NULL,private_key text NOT NULL)`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_push_preferences(user_id text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,muted boolean NOT NULL DEFAULT false,quiet boolean NOT NULL DEFAULT true,timezone text NOT NULL DEFAULT 'Asia/Singapore',last_seen_at timestamptz,last_sent_at timestamptz)`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_push_devices(id text PRIMARY KEY,user_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,subscription text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`)
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS amc_push_devices_user ON amc_push_devices(user_id)`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_push_deliveries(notification_id text PRIMARY KEY REFERENCES "Notification"(id) ON DELETE CASCADE,state text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now())`)
 })
}
export async function pushKeys(db:any=prisma){
 const old=(await db.$queryRawUnsafe(`SELECT * FROM amc_push_keys WHERE id=1`))[0]
 if(old)return {publicKey:old.public_key,privateKey:decryptSecret(old.private_key)}
 const keys=webpush.generateVAPIDKeys()
 await db.$executeRawUnsafe(`INSERT INTO amc_push_keys(id,public_key,private_key) VALUES(1,$1,$2) ON CONFLICT DO NOTHING`,keys.publicKey,encryptSecret(keys.privateKey))
 return pushKeys(db)
}
export function validateSubscription(input:any){
 const url=new URL(typeof input?.endpoint==='string'?input.endpoint:'invalid')
 const host=url.hostname
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.href.length>3000||!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com')))throw Error('invalid_push_endpoint')
 const key=input.keys?.p256dh,auth=input.keys?.auth
 if(typeof key!=='string'||typeof auth!=='string'||!/^[\w-]{80,100}={0,2}$/.test(key)||!/^[\w-]{20,30}={0,2}$/.test(auth)||Buffer.from(key,'base64url').length!==65||Buffer.from(auth,'base64url').length!==16)throw Error('invalid_push_keys')
 return {endpoint:url.href,keys:{p256dh:key,auth}}
}
export function quietNow(pref:{quiet:boolean;timezone:string},now=new Date()){
 if(!pref.quiet)return false
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:pref.timezone,hour:'2-digit',hourCycle:'h23'}).format(now))
 return hour>=22||hour<8
}
export async function pushSettings(userId:string,db:any=prisma){
 const pref=(await db.$queryRawUnsafe(`SELECT muted,quiet,timezone FROM amc_push_preferences WHERE user_id=$1`,userId))[0]||{muted:false,quiet:true,timezone:'Asia/Singapore'}
 let publicKey:string|null=null;try{publicKey=(await pushKeys(db)).publicKey}catch{/* Missing infrastructure encryption is not an enabled channel. */}
 return {...pref,publicKey}
}
export async function updatePush(userId:string,input:any,db:any=prisma){
 if(!['subscribe','unsubscribe','preferences'].includes(input?.action))throw Error('invalid_action')
 if(input.action==='preferences'){
  const old=await pushSettings(userId,db);input={...old,...input}
  const timezone=typeof input.timezone==='string'?input.timezone:'Asia/Singapore';new Intl.DateTimeFormat('en',{timeZone:timezone}).format()
  if(typeof input.muted!=='boolean'||typeof input.quiet!=='boolean')throw Error('invalid_preferences')
  await db.$executeRawUnsafe(`INSERT INTO amc_push_preferences(user_id,muted,quiet,timezone) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET muted=EXCLUDED.muted,quiet=EXCLUDED.quiet,timezone=EXCLUDED.timezone`,userId,input.muted,input.quiet,timezone)
 }else{
  const subscription=validateSubscription(input.subscription),id=createHash('sha256').update(subscription.endpoint).digest('hex')
  if(input.action==='unsubscribe')await db.$executeRawUnsafe(`DELETE FROM amc_push_devices WHERE id=$1 AND user_id=$2`,id,userId)
  else{
   await pushKeys(db)
   await db.$transaction(async(tx:any)=>{
    await tx.$queryRawUnsafe(`SELECT id FROM "User" WHERE id=$1 FOR UPDATE`,userId)
    const count=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM amc_push_devices WHERE user_id=$1 AND id<>$2`,userId,id))[0].n
    if(count>=5)throw Error('device_limit')
    await tx.$executeRawUnsafe(`INSERT INTO amc_push_devices(id,user_id,subscription) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription,created_at=now()`,id,userId,encryptSecret(JSON.stringify(subscription)))
    await tx.$executeRawUnsafe(`INSERT INTO amc_push_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING`,userId)
   })
  }
 }
 return pushSettings(userId,db)
}
export async function notePushPresence(userId:string,db:any=prisma){await db.$executeRawUnsafe(`UPDATE amc_push_preferences SET last_seen_at=now() WHERE user_id=$1`,userId)}
/** Sender is injectable; tests never send messages to real push providers. */
export async function deliverPushNotices(db:any=prisma,send=webpush.sendNotification,now=new Date()){
 await db.$executeRawUnsafe(`UPDATE amc_push_deliveries SET state='unknown' WHERE state='sending' AND next_at<now()-interval '2 minutes'`)
 const people=await db.$queryRawUnsafe(`SELECT p.* FROM amc_push_preferences p JOIN "User" u ON u.id=p.user_id AND u.status='ACTIVE' WHERE NOT p.muted AND (p.last_seen_at IS NULL OR p.last_seen_at<now()-interval '90 seconds') AND (p.last_sent_at IS NULL OR p.last_sent_at<now()-interval '1 minute') AND EXISTS(SELECT 1 FROM amc_push_devices d WHERE d.user_id=p.user_id) ORDER BY p.last_sent_at NULLS FIRST LIMIT 20`)
 for(const pref of people){
  if(quietNow(pref,now)){await db.$executeRawUnsafe(`UPDATE amc_push_preferences SET last_sent_at=now() WHERE user_id=$1`,pref.user_id);continue}
  const result=await db.$transaction(async(tx:any)=>{
   // Claim at recipient level so concurrent workers produce one grouped push.
   const claimed=await tx.$executeRawUnsafe(`UPDATE amc_push_preferences SET last_sent_at=now() WHERE user_id=$1 AND NOT muted AND (last_seen_at IS NULL OR last_seen_at<now()-interval '90 seconds') AND (last_sent_at IS NULL OR last_sent_at<now()-interval '1 minute')`,pref.user_id)
   if(!claimed)return null
   const candidates=await tx.$queryRawUnsafe(`SELECT n.id,n."brandId",n.title,n."actionUrl" FROM "Notification" n WHERE n."userId"=$1 AND n.status='UNREAD' AND n.type IN ('BACKGROUND_COMPLETED','BACKGROUND_FAILED','BACKGROUND_ATTENTION') AND n."createdAt">(now()-interval '24 hours') AT TIME ZONE 'UTC' AND EXISTS(SELECT 1 FROM amc_push_devices s WHERE s.user_id=$1 AND s.created_at<=(n."createdAt" AT TIME ZONE 'UTC')) AND NOT EXISTS(SELECT 1 FROM "InboxReceipt" r WHERE r."userId"=$1 AND r.key='notification:'||n.id AND (r."readAt" IS NOT NULL OR r."remindedAt" IS NOT NULL OR r.state='done' OR r.until>now() AT TIME ZONE 'UTC')) AND NOT EXISTS(SELECT 1 FROM amc_push_deliveries d WHERE d.notification_id=n.id AND (d.state!='retry' OR d.next_at>now())) ORDER BY n."createdAt" LIMIT 20`,pref.user_id)
   const notices=candidates.filter((n:any)=>n.brandId===candidates[0]?.brandId)
   for(const n of notices)await tx.$executeRawUnsafe(`INSERT INTO amc_push_deliveries(notification_id,state,attempts) VALUES($1,'sending',1) ON CONFLICT(notification_id) DO UPDATE SET state='sending',attempts=amc_push_deliveries.attempts+1,next_at=now()`,n.id)
   return notices
  })
  if(!result?.length)continue
  const allowed=[]
  for(const n of result)if(n.brandId&&await canUserAccessBrand(n.brandId,pref.user_id,'READ',db))allowed.push(n);else await db.$executeRawUnsafe(`UPDATE amc_push_deliveries SET state='suppressed' WHERE notification_id=$1`,n.id)
  if(!allowed.length){for(const n of result)await db.$executeRawUnsafe(`UPDATE amc_push_deliveries SET state='suppressed' WHERE notification_id=$1`,n.id);continue}
  const devices=await db.$queryRawUnsafe(`SELECT * FROM amc_push_devices WHERE user_id=$1 LIMIT 5`,pref.user_id)
  let accepted=false,retryable=false
  try{
   const keys=await pushKeys(db)
   const ids=allowed.map((n:any)=>n.id).sort(),tag=createHash('sha256').update(ids.join(':')).digest('hex')
   const payload=JSON.stringify({title:allowed.length===1?allowed[0].title:`${allowed.length} 项后台任务有更新`,body:'打开 AMC 查看结果或需要处理的事项。',tag,url:allowed.length===1?allowed[0].actionUrl+'&noticeId='+encodeURIComponent(allowed[0].id):'/dashboard?notice=inbox&brandId='+encodeURIComponent(allowed[0].brandId)})
   for(const device of devices){
    try{await send(validateSubscription(JSON.parse(decryptSecret(device.subscription))),payload,{TTL:3600,urgency:'normal',topic:tag.slice(0,32),timeout:10000,vapidDetails:{subject:'https://amc-mm.immedi.ai',...keys}});accepted=true}
    catch(error){const status=(error as any)?.statusCode;if(status===404||status===410)await db.$executeRawUnsafe(`DELETE FROM amc_push_devices WHERE id=$1`,device.id);else if(status===429||status>=500)retryable=true}
   }
  }catch{/* Keep the inbox result. Never claim an unconfirmed external delivery. */}
  for(const n of allowed)await db.$executeRawUnsafe(`UPDATE amc_push_deliveries SET state=CASE WHEN $2 THEN 'sent' WHEN $3 AND attempts<3 THEN 'retry' ELSE 'unknown' END,next_at=now()+interval '5 minutes' WHERE notification_id=$1`,n.id,accepted,retryable)
 }
}
