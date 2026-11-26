import {randomBytes,createHash} from 'node:crypto'
import {encryptSecret,decryptSecret} from '../model-management/secrets'
import {isLarkError,LarkError,hash} from './provider'

export type LarkActor={userId:string;authVersion:number}
export type LarkTokens={accessToken:string;refreshToken?:string;refreshExpiresAt?:number;scope:string}
export type Connection={userId:string;brandId:string;appId:string;tokenCipher:string;openId:string;displayName:string;expiresAt:Date;connectedAt:Date}
type State={stateHash:string;userId:string;brandId:string;authVersion:number;appId:string;redirectUri:string;verifierCipher:string;expiresAt:Date;consumed:boolean}
export const lock=async(tx:any,userId:string,brandId:string)=>tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lark:${userId}:${brandId}`},0))`
const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex')
export function seal(userId:string,brandId:string,value:unknown){return encryptSecret(JSON.stringify({userId,brandId,value}))}
export function unseal<T>(userId:string,brandId:string,cipher:string):T{
  const value=JSON.parse(decryptSecret(cipher))
  if(value.userId!==userId||value.brandId!==brandId)throw new LarkError('LARK_CREDENTIAL_BINDING_INVALID',403)
  return value.value as T
}
export class LarkStore {
  constructor(public db:any){}
  async connection(userId:string,brandId:string,db=this.db):Promise<Connection|null>{
    const rows=await db.$queryRaw`SELECT * FROM "LarkUserConnection" WHERE "userId"=${userId} AND "brandId"=${brandId}`
    return rows[0]||null
  }
  async start(actor:LarkActor,brandId:string,appId:string,redirectUri:string){
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),stateHash=fingerprint(state),verifierCipher=seal(actor.userId,brandId,verifier),expiresAt=new Date(Date.now()+600000)
    await this.db.$transaction(async(tx:any)=>{
      await lock(tx,actor.userId,brandId)
      await tx.$executeRaw`DELETE FROM "LarkOAuthState" WHERE ("userId"=${actor.userId} AND "brandId"=${brandId}) OR "expiresAt" < NOW()`
      await tx.$executeRaw`INSERT INTO "LarkOAuthState" ("stateHash","userId","brandId","authVersion","appId","redirectUri","verifierCipher","expiresAt") VALUES (${stateHash},${actor.userId},${brandId},${actor.authVersion},${appId},${redirectUri},${verifierCipher},${expiresAt})`
    })
    return {state,codeChallenge:createHash('sha256').update(verifier).digest('base64url')}
  }
  async consume(actor:LarkActor,brandId:string,state:string):Promise<State>{
    const stateHash=fingerprint(state)
    return this.db.$transaction(async(tx:any)=>{
      await lock(tx,actor.userId,brandId)
      const rows=await tx.$queryRaw`UPDATE "LarkOAuthState" SET "consumed"=TRUE WHERE "stateHash"=${stateHash} AND "userId"=${actor.userId} AND "brandId"=${brandId} AND "authVersion"=${actor.authVersion} AND "expiresAt">NOW() AND "consumed"=FALSE RETURNING *`
      if(!rows[0])throw new LarkError('LARK_AUTHORIZATION_EXPIRED_OR_USED',409)
      return rows[0]
    })
  }
  async finish(actor:LarkActor,state:State,identity:{open_id:string;name?:string},tokens:LarkTokens,expiresAt:Date){
    const cipher=seal(actor.userId,state.brandId,tokens),name=(identity.name||'Lark').slice(0,200)
    await this.db.$transaction(async(tx:any)=>{
      await lock(tx,actor.userId,state.brandId)
      const rows=await tx.$queryRaw`DELETE FROM "LarkOAuthState" WHERE "stateHash"=${state.stateHash} AND "userId"=${actor.userId} AND "brandId"=${state.brandId} AND "authVersion"=${actor.authVersion} AND "consumed"=TRUE AND "expiresAt">NOW() RETURNING "stateHash"`
      if(!rows[0])throw new LarkError('LARK_AUTHORIZATION_CANCELLED',409)
      await tx.$executeRaw`INSERT INTO "LarkUserConnection" ("userId","brandId","appId","tokenCipher","openId","displayName","expiresAt") VALUES (${actor.userId},${state.brandId},${state.appId},${cipher},${identity.open_id},${name},${expiresAt}) ON CONFLICT ("userId","brandId") DO UPDATE SET "appId"=EXCLUDED."appId","tokenCipher"=EXCLUDED."tokenCipher","openId"=EXCLUDED."openId","displayName"=EXCLUDED."displayName","expiresAt"=EXCLUDED."expiresAt","connectedAt"=NOW()`
      await tx.auditLog.create({data:{actorId:actor.userId,actorType:'HUMAN',action:'LARK_CONNECTED',resourceType:'LarkConnection',resourceId:state.brandId,newValue:{brandId:state.brandId,appId:state.appId}}})
    })
  }
  async disconnect(actor:LarkActor,brandId:string){
    await this.db.$transaction(async(tx:any)=>{
      await lock(tx,actor.userId,brandId)
      await tx.$executeRaw`DELETE FROM "LarkUserConnection" WHERE "userId"=${actor.userId} AND "brandId"=${brandId}`
      await tx.$executeRaw`DELETE FROM "LarkOAuthState" WHERE "userId"=${actor.userId} AND "brandId"=${brandId}`
      await tx.auditLog.create({data:{actorId:actor.userId,actorType:'HUMAN',action:'LARK_DISCONNECTED',resourceType:'LarkConnection',resourceId:brandId}})
    })
  }
  async token(actor:LarkActor,brandId:string,appId:string,refresh:(tokens:LarkTokens)=>Promise<{tokens:LarkTokens;expiresAt:Date}>){
    return this.db.$transaction(async(tx:any)=>{
      await lock(tx,actor.userId,brandId)
      const row=await this.connection(actor.userId,brandId,tx)
      if(!row||row.appId!==appId)throw new LarkError('LARK_CONNECT_REQUIRED',409)
      const tokens=unseal<LarkTokens>(actor.userId,brandId,row.tokenCipher)
      if(row.expiresAt.getTime()>Date.now()+60000)return tokens.accessToken
      if(!tokens.refreshToken||(tokens.refreshExpiresAt&&tokens.refreshExpiresAt<Date.now()))throw new LarkError('LARK_RECONNECT_REQUIRED',401)
      const next=await refresh(tokens),cipher=seal(actor.userId,brandId,next.tokens)
      await tx.$executeRaw`UPDATE "LarkUserConnection" SET "tokenCipher"=${cipher},"expiresAt"=${next.expiresAt} WHERE "userId"=${actor.userId} AND "brandId"=${brandId}`
      return next.tokens.accessToken
    },{timeout:25000,maxWait:25000})
  }
  async write(actor:LarkActor,brandId:string,key:string,payload:unknown,run:()=>Promise<Record<string,unknown>>){
    const resourceId='lark-write:'+hash([actor.userId,brandId,key]),digest=hash(payload)
    const reserved=await this.db.$transaction(async(tx:any)=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resourceId},0))`
      const old=await tx.auditLog.findFirst({where:{actorId:actor.userId,resourceId,action:'LARK_DOCX_WRITE'}})
      if(old){const value=old.newValue as any;if(value.digest!==digest)throw new LarkError('LARK_REQUEST_KEY_REUSED',409);return {old:value.receipt}}
      const row=await tx.auditLog.create({data:{actorId:actor.userId,actorType:'HUMAN',action:'LARK_DOCX_WRITE',resourceType:'LarkDocument',resourceId,newValue:{brandId,digest,receipt:{state:'outcome_unknown',verified:false,requestKey:key,instructions:'The original write is reserved. Read the original document before taking any further action; do not repeat this write.'}}}})
      return {id:row.id}
    })
    if(reserved.old)return reserved.old
    let receipt:Record<string,unknown>
    try{receipt={...await run(),requestKey:key}}
    catch(error){receipt={state:isLarkError(error)&&error.status<500?'rejected':'outcome_unknown',verified:false,error:isLarkError(error)?error.code:'LARK_OUTCOME_UNCERTAIN',requestKey:key,instructions:'Read the original document and reconcile this request. Do not automatically repeat a write.'}}
    try{await this.db.auditLog.update({where:{id:reserved.id},data:{newValue:{brandId,digest,receipt}}})}
    catch{return {...receipt,state:'outcome_unknown',verified:false,error:'LARK_RECEIPT_PERSISTENCE_UNCERTAIN'}}
    return receipt
  }
}
