import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {profileAiTokens} from '../src/lib/profile-ai-tokens.ts'
import {authenticateRequest} from '../src/lib/auth-v2/authenticate.ts'
import {createSessionToken} from '../src/lib/auth-v2/session.ts'
import {hashApiKeyToken} from '../src/lib/auth-v2/api-key.ts'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
process.env.JWT_SECRET='local-test-secret-not-production';const uid=randomUUID(),other=randomUUID()
const req=(method='GET',body?:unknown,origin='http://localhost',session='')=>new Request('http://localhost/api/profile/ai-tokens',{method,headers:{origin,cookie:'session='+session},...(body?{body:JSON.stringify(body)}:{})})
try{
 for(const id of [uid,other])await prisma.user.create({data:{id,email:id+'@test.invalid',password:'local-fixture',type:'HUMAN',role:'USER'}})
 const legacy=await prisma.userApiKey.create({data:{userId:uid,token:'legacy-local-'+uid,tokenHash:hashApiKeyToken('legacy-local-'+uid),name:'Existing credential'}})
 const foreign=await prisma.userApiKey.create({data:{userId:other,tokenHash:hashApiKeyToken(other),name:'Other user'}})
 const session=await createSessionToken({userId:uid,type:'HUMAN',authVersion:1}),principal=await authenticateRequest(req('GET',undefined,'http://localhost',session));assert(principal)
 const before=await prisma.userApiKey.findMany({orderBy:{id:'asc'}})
 const listing=await profileAiTokens(req(),principal,prisma);assert.equal(listing.status,200);assert.equal(listing.headers.get('cache-control'),'no-store');const list=await listing.json();assert.equal(list.keys.length,1);assert.equal(list.keys[0].id,legacy.id);assert(!JSON.stringify(list).includes('legacy-local'));assert(!('tokenHash' in list.keys[0]))
 assert.deepEqual(await prisma.userApiKey.findMany({orderBy:{id:'asc'}}),before,'Opening profile must not touch existing data')
 assert.equal((await profileAiTokens(req(),null,prisma)).status,401)
 assert.equal((await profileAiTokens(req('POST',{name:'No'},'https://evil.invalid'),principal,prisma)).status,403)
 assert.equal((await profileAiTokens(req(),{...principal,source:'api_key'},prisma)).status,403)
 assert.equal((await profileAiTokens(req('DELETE',{id:foreign.id}),principal,prisma)).status,404)
 assert.equal((await profileAiTokens(req('POST',{name:''}),principal,prisma)).status,400)
 const created=await profileAiTokens(req('POST',{name:'Desktop assistant',userId:other}),principal,prisma);assert.equal(created.status,201);const value=await created.json();const saved=await prisma.userApiKey.findUniqueOrThrow({where:{id:value.key.id}});assert.equal(saved.userId,uid);assert.equal(saved.token,null);assert.equal(saved.tokenHash,hashApiKeyToken(value.token))
 assert.deepEqual(await prisma.userApiKey.findUnique({where:{id:legacy.id}}),legacy,'Creating does not rotate or rewrite older keys')
 const auth=await authenticateRequest(new Request('http://localhost/api/mcp',{headers:{authorization:'Bearer '+legacy.token}}));assert.equal(auth?.userId,uid,'Old credential continues to authenticate')
 const audit=await prisma.auditLog.findMany({where:{actorId:uid}});assert(!JSON.stringify(audit).includes(value.token));assert(!JSON.stringify(audit).includes(saved.tokenHash!))
 assert.equal((await profileAiTokens(req('DELETE',{id:value.key.id}),principal,prisma)).status,200)
 assert.equal(await authenticateRequest(new Request('http://localhost/api/mcp',{headers:{authorization:'Bearer '+value.token}})),null)
 assert.equal((await profileAiTokens(req('DELETE',{id:value.key.id}),principal,prisma)).status,200)
 assert.equal((await prisma.userApiKey.findUnique({where:{id:foreign.id}}))?.revokedAt,null)
 await prisma.user.update({where:{id:uid},data:{status:'SUSPENDED'}});assert.equal(await authenticateRequest(req('GET',undefined,'http://localhost',session)),null)
 console.log('PASS real database: read-only preservation, old credential compatibility, own-user scope, origin/session checks, hash-only creation, nonsecret audit, revocation and suspended sessions')
}finally{await prisma.auditLog.deleteMany({where:{actorId:uid}});await prisma.user.deleteMany({where:{id:{in:[uid,other]}}});await prisma.$disconnect()}
