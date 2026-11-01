import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {profileAiTokens} from '../src/lib/profile-ai-tokens.ts'
import {consolidateUserKeys} from '../src/lib/consolidate-user-keys.ts'
import {authenticateRequest} from '../src/lib/auth-v2/authenticate.ts'
import {createSessionToken} from '../src/lib/auth-v2/session.ts'
import {hashApiKeyToken} from '../src/lib/auth-v2/api-key.ts'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
process.env.JWT_SECRET='local-test-secret-not-production';const uid=randomUUID(),other=randomUUID()
const req=(method='GET',body?:unknown,origin='http://localhost',session='')=>new Request('http://localhost/api/profile/ai-tokens',{method,headers:{origin,cookie:'session='+session},...(body?{body:JSON.stringify(body)}:{})})
const auth=(token:string)=>authenticateRequest(new Request('http://localhost/api/mcp',{headers:{authorization:'Bearer '+token}}))
try{
 for(const id of [uid,other])await prisma.user.create({data:{id,email:id+'@test.invalid',password:'local-fixture',type:'HUMAN',role:'USER'}})
 const old=await prisma.userApiKey.create({data:{userId:uid,token:'old-'+uid,createdAt:new Date('2026-01-01')}})
 const legacy=await prisma.userApiKey.create({data:{userId:uid,token:'legacy-'+uid,tokenHash:hashApiKeyToken('legacy-'+uid),createdAt:new Date('2026-02-01')}})
 await prisma.userApiKey.create({data:{userId:uid,tokenHash:hashApiKeyToken('expired'),expiresAt:new Date('2020-01-01')}})
 const session=await createSessionToken({userId:uid,type:'HUMAN',authVersion:1}),principal=await authenticateRequest(req('GET',undefined,'http://localhost',session));assert(principal)
 const before=await prisma.userApiKey.findMany({orderBy:{id:'asc'}})
 const listing=await profileAiTokens(req(),principal,prisma);assert.equal(listing.headers.get('cache-control'),'no-store');const list=await listing.json();assert.equal(list.key.id,legacy.id);assert(!('token' in list.key));assert(!('tokenHash' in list.key));assert.equal(list.keys.length,1)
 assert.deepEqual(await prisma.userApiKey.findMany({orderBy:{id:'asc'}}),before)
 assert.equal((await consolidateUserKeys(prisma)).revokedKeys,2)
 assert.deepEqual(await prisma.userApiKey.findMany({orderBy:{id:'asc'}}),before)
 assert.equal((await consolidateUserKeys(prisma,true)).revokedKeys,2)
 assert.deepEqual(await prisma.userApiKey.findUnique({where:{id:legacy.id}}),legacy)
 assert.equal((await consolidateUserKeys(prisma,true)).revokedKeys,0)
 assert.equal((await auth(legacy.token!))?.userId,uid);assert.equal(await auth(old.token!),null)
 assert.equal((await profileAiTokens(req(),null,prisma)).status,401)
 assert.equal((await profileAiTokens(req('POST',{expectedKeyId:legacy.id},'https://evil.invalid'),principal,prisma)).status,403)
 assert.equal((await profileAiTokens(req(),{...principal,source:'api_key'},prisma)).status,403)
 assert.equal((await profileAiTokens(req('POST',{}),principal,prisma)).status,400)
 assert.equal((await profileAiTokens(req('POST',{expectedKeyId:null}),principal,prisma)).status,409)
 const failingDb={$transaction:(fn:any)=>prisma.$transaction(tx=>fn(new Proxy(tx,{get(target,prop){return prop==='auditLog'?{create:()=>{throw Error('fixture audit failure')}}:Reflect.get(target,prop)}})))}
 await assert.rejects(()=>profileAiTokens(req('POST',{expectedKeyId:legacy.id}),principal,failingDb))
 assert.equal((await prisma.userApiKey.findUnique({where:{id:legacy.id}}))?.revokedAt,null,'Failed refresh rolls back revocation')
 const responses=await Promise.all([1,2].map(()=>profileAiTokens(req('POST',{expectedKeyId:legacy.id,userId:other}),principal,prisma)))
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);const value=await responses.find(r=>r.status===201)!.json()
 const saved=await prisma.userApiKey.findUniqueOrThrow({where:{id:value.key.id}});assert.equal(saved.userId,uid);assert.equal(saved.token,null);assert.equal(saved.tokenHash,hashApiKeyToken(value.token))
 assert.equal(await auth(legacy.token!),null);assert.equal((await auth(value.token))?.userId,uid)
 assert.equal(await prisma.userApiKey.count({where:{userId:uid,revokedAt:null}}),1)
 const fresh=await profileAiTokens(req('POST',{expectedKeyId:null}),{...principal,userId:other},prisma);assert.equal(fresh.status,201)
 const audit=await prisma.auditLog.findMany({where:{actorId:uid}});assert(!JSON.stringify(audit).includes(value.token));assert(!JSON.stringify(audit).includes(saved.tokenHash!))
 await prisma.user.update({where:{id:uid},data:{status:'SUSPENDED'}});assert.equal(await authenticateRequest(req('GET',undefined,'http://localhost',session)),null)
 console.log('PASS single current key, read-only GET, dry-run preservation, latest-valid retention, idempotent consolidation, refresh invalidation, concurrent/stale refresh conflict, user isolation, session/origin, hash-only storage and nonsecret audit')
}finally{await prisma.auditLog.deleteMany({where:{actorId:{in:[uid,other]}}});await prisma.user.deleteMany({where:{id:{in:[uid,other]}}});await prisma.$disconnect()}
