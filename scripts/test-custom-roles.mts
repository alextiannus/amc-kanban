import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { effectiveGrants, defaultGrants, PERMISSION_PROTOCOL } from '../src/lib/role-permissions/contract.ts'
import { principalFromUser } from '../src/lib/auth-v2/types.ts'
import { buildOverview } from '../src/lib/access-overview/overview.ts'
import { describePolicy } from '../src/lib/role-permissions/describe.ts'
import { getMenuGroups } from '../src/lib/permissions.ts'
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:1/test'
const { createRole, updateRole, setRoleMember, roleName } = await import('../src/lib/role-permissions/roles.ts')
const { readPolicies, savePolicy } = await import('../src/lib/role-permissions/store.ts')
const pg=new PGlite()
await pg.exec(await readFile(new URL('../prisma/migrations/20260917090000_role_permission_policy/migration.sql',import.meta.url),'utf8'))
await pg.exec('CREATE TABLE "UserBusinessRole" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, role TEXT NOT NULL, UNIQUE("userId",role)); CREATE TABLE audit (value jsonb);')
const migration=await readFile(new URL('../prisma/migrations/20260917120000_custom_role_definitions/migration.sql',import.meta.url),'utf8')
await pg.exec(`INSERT INTO "UserBusinessRole" VALUES ('bad','human','UNKNOWN')`)
await assert.rejects(pg.exec(migration),/Unregistered historical/)
await pg.exec('ROLLBACK')
assert.equal((await pg.query(`SELECT to_regclass('"RoleDefinition"') AS name`)).rows[0].name,null)
await pg.exec(`DELETE FROM "UserBusinessRole" WHERE id='bad'`)
await pg.exec(migration)
let failAudit=false
function adapter(sql:any):any {
 const one=async(q:string,args:any[]=[]) => (await sql.query(q,args)).rows[0] || null
 return {
  roleDefinition:{
   findUnique:async({where,include}:any)=>{const role=await one('SELECT * FROM "RoleDefinition" WHERE id=$1',[where.id]);if(role&&include?.policy)role.policy=await one('SELECT * FROM "RolePermissionPolicy" WHERE role=$1',[where.id]);return role},
   findUniqueOrThrow:async({where}:any)=>{const role=await one('SELECT * FROM "RoleDefinition" WHERE id=$1',[where.id]);if(!role)throw Error('missing');return role},
   findMany:async()=>{const rows=(await sql.query('SELECT * FROM "RoleDefinition"')).rows;for(const row of rows){row.policy=await one('SELECT * FROM "RolePermissionPolicy" WHERE role=$1',[row.id]);row._count={members:Number((await one('SELECT count(*) AS n FROM "UserBusinessRole" WHERE role=$1',[row.id])).n)}}return rows},
   create:async({data:d}:any)=>one('INSERT INTO "RoleDefinition" (id,name,"normalizedName",description) VALUES ($1,$2,$3,$4) RETURNING *',[d.id,d.name,d.normalizedName,d.description]),
   updateMany:async({where,data:d}:any)=>{const row=await one('UPDATE "RoleDefinition" SET name=COALESCE($3,name),"normalizedName"=COALESCE($4,"normalizedName"),description=COALESCE($5,description),enabled=COALESCE($6,enabled),version=version+1 WHERE id=$1 AND version=$2 RETURNING id',[where.id,where.version,d.name??null,d.normalizedName??null,d.description??null,d.enabled??null]);return {count:row?1:0}}
  },
  rolePermissionPolicy:{
   findUnique:async({where}:any)=>one('SELECT * FROM "RolePermissionPolicy" WHERE role=$1',[where.role]),
   create:async({data:d}:any)=>one('INSERT INTO "RolePermissionPolicy" (role,grants,version) VALUES ($1,$2::jsonb,1) RETURNING *',[d.role,JSON.stringify(d.grants)]),
   updateMany:async({where,data:d}:any)=>({count:(await sql.query('UPDATE "RolePermissionPolicy" SET grants=$3::jsonb,version=version+1 WHERE role=$1 AND version=$2 RETURNING role',[where.role,where.version,JSON.stringify(d.grants)])).rows.length})
  },
  userBusinessRole:{
   findUnique:async({where}:any)=>one('SELECT * FROM "UserBusinessRole" WHERE "userId"=$1 AND role=$2',[where.userId_role.userId,where.userId_role.role]),
   create:async({data:d}:any)=>one('INSERT INTO "UserBusinessRole" VALUES ($1,$2,$3) RETURNING *',[randomUUID(),d.userId,d.role]),
   delete:async({where}:any)=>sql.query('DELETE FROM "UserBusinessRole" WHERE id=$1',[where.id])
  },
  user:{findUnique:async({where}:any)=>where.id==='human'?{type:'HUMAN'}:null,count:async()=>1},
  auditLog:{create:async({data}:any)=>{if(failAudit)throw Error('audit unavailable');await sql.query('INSERT INTO audit VALUES ($1::jsonb)',[JSON.stringify(data)])}}
 }
}
const db:any={...adapter(pg),$transaction:(fn:any)=>pg.transaction(sql=>fn(adapter(sql)))}
const admin:any={userId:'admin',globalRoles:['ADMIN'],actorType:'HUMAN',source:'session',authVersion:1}
try {
 assert.equal(roleName('  编辑员  ').name,'编辑员')
 assert.throws(()=>roleName('ADMIN'),/保留/)
 await assert.rejects(createRole({...admin,source:'api_key'},{name:'Denied'},db),/Forbidden/)
 await assert.rejects(createRole({...admin,globalRoles:[]},{name:'Denied'},db),/Forbidden/)
 await assert.rejects(createRole(admin,{name:'Copy Admin',copyFrom:'ADMIN'},db),/只能复制/)
 const role=await createRole(admin,{name:'内容编辑'},db)
 let state=await readPolicies(db)
 assert.deepEqual(state.policies[role.id],[])
 await assert.rejects(createRole(admin,{name:'内容编辑'},db))
 const latin=await createRole(admin,{name:'EDITOR'},db)
 await assert.rejects(createRole(admin,{name:' editor '},db))
 await savePolicy(admin,role.id,{expectedVersion:1,grants:['content.skills.read']},db)
 const copy=await createRole(admin,{name:'副本',copyFrom:role.id},db)
 await savePolicy(admin,role.id,{expectedVersion:2,grants:[]},db)
 state=await readPolicies(db)
 assert.deepEqual(state.policies[copy.id],['content.skills.read'],'copy is independent')
 await setRoleMember(admin,copy.id,'human',true,db);await setRoleMember(admin,copy.id,'human',true,db)
 assert.equal((await pg.query('SELECT * FROM "UserBusinessRole"')).rows.length,1)
 const principal=principalFromUser({id:'human',email:'test',role:'USER',status:'ACTIVE',type:'HUMAN',authVersion:1,businessRoles:[{role:copy.id}]},'session')
 assert.deepEqual(principal.globalRoles,[],'custom role cannot impersonate built-in identity')
 assert.deepEqual(effectiveGrants(principal.permissionRoleIds!,state.policies),['content.skills.read'])
 assert.ok(getMenuGroups(principal.globalRoles, effectiveGrants(principal.permissionRoleIds!,state.policies)).some(group=>group.items.some(item=>item.id==='content.skills')),'custom-only user receives functional navigation')
 const videoPolicy = { [copy.id]: ['content.video-making.read','content.video-making.generate'] }
 const deniedBrand = describePolicy([], {roles:[],permissionRoleIds:[copy.id],brandScope:'denied'}, videoPolicy, true)
 assert.equal(deniedBrand.find(row=>row.moduleId==='content.video-making')!.page.state,'denied')
 const allowedBrand = describePolicy([], {roles:[],permissionRoleIds:[copy.id],brandScope:'allowed'}, videoPolicy, true)
 assert.equal(allowedBrand.find(row=>row.moduleId==='content.video-making')!.page.state,'allowed')
 const disabled=await updateRole(admin,copy.id,{expectedVersion:1,enabled:false},db)
 state=await readPolicies(db)
 assert.deepEqual(state.policies[copy.id],[])
 assert.deepEqual(state.configuredPolicies[copy.id],['content.skills.read'])
 assert.equal(state.roles.find(r=>r.id===copy.id)?.memberCount,1)
 await assert.rejects(setRoleMember(admin,copy.id,'human',true,db),/停用/)
 await assert.rejects(createRole(admin,{name:'停用副本',copyFrom:copy.id},db),/只能复制/)
 await assert.rejects(updateRole(admin,copy.id,{expectedVersion:1,name:'stale'},db),/刷新/)
 await updateRole(admin,copy.id,{expectedVersion:disabled.version,enabled:true},db)
 state=await readPolicies(db)
 assert.deepEqual(effectiveGrants([copy.id,role.id],state.policies),['content.skills.read'])
 const overview=buildOverview({},undefined,state.policies,state.roles)
 assert.ok(overview.roles.includes(copy.id))
 assert.ok(overview.matrix![copy.id].some(row=>row.moduleId==='content.skills'))
 await assert.rejects(updateRole(admin,'AMC_PRINCIPAL',{expectedVersion:1,enabled:false},db),/预设/)
 await assert.rejects(savePolicy(admin,copy.id,{expectedVersion:1,grants:['system.configure']},db),/未知/)
 await setRoleMember(admin,copy.id,'human',false,db);await setRoleMember(admin,copy.id,'human',false,db)
 assert.equal((await pg.query('SELECT * FROM "UserBusinessRole"')).rows.length,0)
 failAudit=true
 await assert.rejects(createRole(admin,{name:'回滚角色'},db),/audit unavailable/)
 assert.equal((await pg.query('SELECT * FROM "RoleDefinition" WHERE name=$1',['回滚角色'])).rows.length,0)
 assert.equal(PERMISSION_PROTOCOL,2)
 console.log('PASS: custom role migration preflight, create/copy/name uniqueness, preserved membership, disable/enable, idempotency, concurrency, audit rollback and identity separation')
} finally { await pg.close() }
