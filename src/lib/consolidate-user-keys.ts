import {currentUserKey,lockUserKeys} from './profile-ai-tokens'
// Keep the newest valid credential byte-for-byte; retain revoked rows for audit.
export async function consolidateUserKeys(db:any,apply=false){
 const users=await db.userApiKey.findMany({where:{revokedAt:null},distinct:['userId'],select:{userId:true}})
 let affectedUsers=0,revokedKeys=0
 for(const {userId} of users){
  const count=await db.$transaction(async(tx:any)=>{
   await lockUserKeys(tx,userId)
   const keep=await currentUserKey(tx,userId)
   const where={userId,revokedAt:null,...(keep?{id:{not:keep.id}}:{})}
   const count=await tx.userApiKey.count({where})
   if(apply&&count){
    await tx.userApiKey.updateMany({where,data:{revokedAt:new Date()}})
    await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'USER_API_KEYS_CONSOLIDATED',resourceType:'User',resourceId:userId,newValue:{retainedKeyId:keep?.id??null,revokedCount:count}}})
   }
   return count
  })
  if(count){affectedUsers++;revokedKeys+=count}
 }
 return {apply,affectedUsers,revokedKeys}
}
