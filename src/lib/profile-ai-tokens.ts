import {createApiKeyToken,hashApiKeyToken,apiKeyPrefix} from './auth-v2/api-key'
import type {AuthPrincipal} from './auth-v2/types'
import {publicKanbanOrigin} from './publicKanbanOrigin'

const select={id:true,name:true,prefix:true,createdAt:true,lastUsedAt:true,expiresAt:true,revokedAt:true}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function profileAiTokens(request:Request,principal:AuthPrincipal|null,db:any){
 if(!principal)return json({error:'Unauthorized'},401)
 if(principal.source!=='session')return json({error:'Sign in to manage your personal AI tokens'},403)
 const userId=principal.userId
 if(request.method==='GET')return json({keys:await db.userApiKey.findMany({where:{userId},select,orderBy:{createdAt:'desc'}})})
 const origin=request.headers.get('origin'),allowed=new Set([publicKanbanOrigin(request),'https://amc-mm.immedi.ai'])
 if(process.env.NODE_ENV!=='production')allowed.add(new URL(request.url).origin)
 if(!origin||!allowed.has(origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Forbidden origin'},403)
 let body:any;try{const raw=await request.text();if(raw.length>4096)return json({error:'Request too large'},413);body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'Invalid request'},400)}catch{return json({error:'Invalid request'},400)}
 if(request.method==='POST'){
  if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)return json({error:'Name must contain 1–80 characters'},400)
  const token=createApiKeyToken('amc_user')
  const key=await db.$transaction(async(tx:any)=>{
   const key=await tx.userApiKey.create({data:{userId,name:body.name.trim(),tokenHash:hashApiKeyToken(token),prefix:apiKeyPrefix(token)},select})
   await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'USER_API_KEY_CREATED',resourceType:'UserApiKey',resourceId:key.id,newValue:{userId,keyId:key.id,name:key.name,prefix:key.prefix}}})
   return key
  })
  return json({key,token},201)
 }
 if(request.method==='DELETE'){
  if(typeof body.id!=='string'||!body.id||body.id.length>128)return json({error:'Invalid token identifier'},400)
  const found=await db.$transaction(async(tx:any)=>{
   const key=await tx.userApiKey.findFirst({where:{id:body.id,userId},select:{id:true,revokedAt:true}})
   if(!key)return false
   const updated=await tx.userApiKey.updateMany({where:{id:key.id,userId,revokedAt:null},data:{revokedAt:new Date()}})
   if(updated.count)await tx.auditLog.create({data:{actorId:userId,actorType:'HUMAN',action:'USER_API_KEY_REVOKED',resourceType:'UserApiKey',resourceId:key.id,newValue:{userId,keyId:key.id}}})
   return true
  })
  return found?json({ok:true}):json({error:'Token not found'},404)
 }
 return json({error:'Method not allowed'},405)
}
