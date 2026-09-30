import {prisma} from '../prisma.ts'
import {canUserAccessBrand} from '../user-management/brandAccess.ts'
export async function inboxState(userId:string,brandId:string|undefined,body?:any,db:any=prisma){
 if(brandId&&!await canUserAccessBrand(brandId,userId,'READ',db))throw Object.assign(new Error('Not found'),{status:404})
 if(!brandId&&!await db.user.findFirst({where:{id:userId,status:'ACTIVE'},select:{id:true}}))throw Object.assign(new Error('Not found'),{status:404})
 let claimed=false
 if(body){
  if(typeof body.key!=='string'||body.key.length>240||! /^(notification|action|brand_idea|weekly_summary):[^\s]+$/.test(body.key)||!['remind','read','done','snooze'].includes(body.action))throw Object.assign(new Error('Invalid inbox action'),{status:400})
  let receiptBrand=brandId||null
  if(body.key.startsWith('notification:')){
   const notification=await db.notification.findUnique({where:{id:body.key.slice('notification:'.length)}})
   if(!notification||notification.userId!==userId||(notification.brandId&&notification.brandId!==brandId))throw Object.assign(new Error('Not found'),{status:404})
   receiptBrand=notification.brandId
  }else if(!brandId)throw Object.assign(new Error('Brand required'),{status:400})
  const where={userId_key:{userId,key:body.key}},now=new Date()
  const prior=await db.inboxReceipt.findUnique({where})
  if(prior&&prior.brandId!==receiptBrand)throw Object.assign(new Error('Not found'),{status:404})
  await db.inboxReceipt.createMany({data:[{userId,brandId:receiptBrand,key:body.key}],skipDuplicates:true})
  if(body.action==='remind'){
   const result=await db.inboxReceipt.updateMany({where:{userId,brandId:receiptBrand,key:body.key,remindedAt:null,readAt:null,state:{not:'done'},OR:[{until:null},{until:{lte:now}}]},data:{remindedAt:now}})
   claimed=result.count===1
  }else{const result=await db.inboxReceipt.updateMany({where:{userId,brandId:receiptBrand,key:body.key},data:body.action==='snooze'?{state:'snoozed',until:new Date(now.getTime()+86400000)}:{readAt:now,...(body.action==='done'?{state:'done',until:null}:{})}});if(!result.count)throw Object.assign(new Error('Not found'),{status:404})}
 }
 const rows=await db.inboxReceipt.findMany({where:{userId,OR:[{brandId:brandId||null},{brandId:null}]}})
 return {claimed,controls:Object.fromEntries(rows.map((r:any)=>[r.key,{state:r.state,readAt:r.readAt?.getTime(),remindedAt:r.remindedAt?.getTime(),until:r.until?.getTime()}]))}
}
