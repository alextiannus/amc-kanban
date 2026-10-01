import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {authenticateRequest} from '../src/lib/auth-v2/authenticate.ts'
import {createSessionToken} from '../src/lib/auth-v2/session.ts'
import {hashApiKeyToken,activeUserCredential} from '../src/lib/auth-v2/api-key.ts'
import {canAccessBrandScope} from '../src/lib/auth-v2/authorize.ts'
import {signAccessIdentity,verifyAccessIdentity} from '../src/lib/role-permissions/token.ts'
import {requireRoleAdmin} from '../src/lib/role-permissions/roles.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
process.env.JWT_SECRET='local-parity-test-secret-that-is-long-enough'
process.env.AMC_CONTENT_LAB_TOKEN_SECRET='local-content-identity-parity-secret'
const id='parity-'+randomUUID(),keyId=id+'-key',token='amc_key_'+randomUUID(),brand=id+'-brand',other=id+'-other'
try {
 await prisma.user.create({data:{id,email:id+'@example.invalid',password:'fixture',authVersion:1,businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 for(const bid of [brand,other])await prisma.brand.create({data:{id:bid,name:bid,status:'ACTIVE',...(bid===brand?{crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}:{})}})
 await prisma.userApiKey.create({data:{id:keyId,userId:id,tokenHash:hashApiKeyToken(token),name:'local fixture'}})
 const cookie='session='+await createSessionToken({userId:id,type:'HUMAN',authVersion:1,expiresIn:'5m'})
 const auth=(headers:Record<string,string>)=>authenticateRequest(new Request('https://example.invalid/api/brands',{headers}))
 const session=await auth({cookie}),key=await auth({'x-api-key':token}),bearer=await auth({authorization:'Bearer '+token})
 assert(session&&key&&bearer)
 for(const p of [key,bearer]){assert.equal(p.userId,session.userId);assert.deepEqual(p.globalRoles,session.globalRoles);assert.equal(p.source,'api_key');assert.equal(p.credentialId,keyId);assert.equal(await canAccessBrandScope(p,brand),true);assert.equal(await canAccessBrandScope(p,other),false)}
 for(const headers of [{'x-api-key':'bad',cookie},{authorization:'Bearer bad',cookie},{authorization:'',cookie},{'x-api-key':'',cookie},{authorization:'Bearer wrong','x-api-key':token,cookie}])assert.equal(await auth(headers),null)
 const identity=verifyAccessIdentity(signAccessIdentity(key,brand));assert.equal(identity?.credentialId,keyId);assert.equal(identity?.source,'api_key');assert.equal(await activeUserCredential(id,keyId),true)
 await prisma.userApiKey.update({where:{id:keyId},data:{revokedAt:new Date()}})
 assert.equal(await auth({'x-api-key':token,cookie}),null);assert.equal(await activeUserCredential(id,keyId),false)
 await prisma.userApiKey.update({where:{id:keyId},data:{revokedAt:null,expiresAt:new Date(Date.now()-1000)}});assert.equal(await auth({'x-api-key':token}),null)
 await prisma.userApiKey.update({where:{id:keyId},data:{expiresAt:null}})
 await prisma.user.update({where:{id},data:{status:'DISABLED'}});assert.equal(await auth({'x-api-key':token}),null);assert.equal(await auth({cookie}),null)
 await prisma.user.update({where:{id},data:{status:'ACTIVE'}})
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 assert.equal(await canAccessBrandScope((await auth({'x-api-key':token}))!,brand),false)
 await prisma.user.update({where:{id},data:{role:'ADMIN'}})
 for(const h of [{cookie},{'x-api-key':token}]){const p=await auth(h);assert(p?.globalRoles.includes('ADMIN'));requireRoleAdmin(p!)}
 await prisma.user.update({where:{id},data:{role:'USER'}})
 const revokedAdmin=await auth({'x-api-key':token});assert(!revokedAdmin?.globalRoles.includes('ADMIN'));assert.throws(()=>requireRoleAdmin(revokedAdmin!))
 console.log('PASS: same live principal, scope, admin parity, credential provenance, revoke/expiry/disable/live role and membership changes; invalid key never falls back to cookie')
}finally{await prisma.brand.deleteMany({where:{id:{in:[brand,other]}}});await prisma.user.deleteMany({where:{id}});await prisma.$disconnect()}
