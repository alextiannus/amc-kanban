import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import ts from 'typescript'

// Run the real store SQL in isolated PostgreSQL WASM; no production DB or providers.
const db=new PGlite()
const pool:any={query:async(sql:string,args?:any[])=>{
  if(!args&&sql.includes('CREATE SCHEMA')){await db.exec(sql);return {rows:[],rowCount:0}}
  const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows.length}
},connect:async()=>({...pool,release(){}})}
const accounts=[{id:'account',platformId:'instagram',handle:'brand'}]
const dependencies:any={
 './store':{nativePool:()=>pool},
 '../prisma':{prisma:{crewMember:{findFirst:async({where}:any)=>where.userId==='owner'?{userId:'owner'}:null,findMany:async()=>[{userId:'owner'}]},socialAccount:{findFirst:async()=>accounts[0],findMany:async({where}:any)=>where.brandId==='seed'?[{...accounts[0],id:'seed-account'}]:accounts}}},
 './contract':{actorFor:(brandId:string,userId:string)=>({brandId,userId}),nativeError:(code:string,status=400)=>Object.assign(Error(code),{code,status})},
 './application':{requireActor:async()=>{}},'../role-permissions/delegation':{requireActorPermission:async()=>{}},
}
const module={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/autopilot-store.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>dependencies[id]||{},module,module.exports)
const store=module.exports
try{
 await db.exec(`CREATE TABLE public."User"(id text PRIMARY KEY);
 CREATE TABLE public."Brand"(id text PRIMARY KEY);
 CREATE TABLE public."SocialAccount"(id text PRIMARY KEY,"brandId" text,"unboundAt" timestamptz);
 CREATE TABLE public."AuditLog"(id text PRIMARY KEY,"actorId" text,"actorType" text,action text,"resourceType" text,"resourceId" text,metadata jsonb,timestamp timestamptz);
 INSERT INTO public."User" VALUES('owner');
 INSERT INTO public."Brand" SELECT unnest(ARRAY['new','seed','automatic','edited','manual','disabled','unknown','foreign-policy']);
 INSERT INTO public."SocialAccount" VALUES('account','new',null),('seed-account','seed',null);`)
 await store.initializeAutopilot(pool)
 const initial=await store.autopilotSettings('owner','new')
 assert.equal(initial.settings.enabled,false,'missing settings must be off')
 assert.equal(initial.settings.cadence,'daily')
 assert.equal(initial.settings.budgetLimitCents,0)
 assert.equal(initial.canManage,true)
 const reader=await store.autopilotSettings('reader','new')
 assert.equal(reader.canManage,false,'a reader cannot edit the settings')
 await assert.rejects(()=>store.autopilotSettings('reader','new',{enabled:false,revision:0,dailyLimit:1}),/autopilot_principal_required/)
 await assert.rejects(()=>store.autopilotSettings('owner','new',{enabled:true,revision:0,dailyLimit:1}),/autopilot_account_required/)
 await store.initializeBrandAutopilotDefault('seed')
 assert.equal((await db.query<any>("SELECT enabled FROM amc_iaic.autopilot_settings WHERE brand_id='seed'")).rows[0].enabled,false,'the background initializer cannot enable a brand')
 const saved=await store.autopilotSettings('owner','new',{enabled:true,revision:0,dailyLimit:2,accountId:'account',objective:'Prepare three source-backed social drafts for principal review.',cadence:'weekly',budgetLimitCents:2500})
 assert.equal(saved.settings.enabled,true,'an explicit principal save can enable')
 assert.equal(saved.settings.objective,'Prepare three source-backed social drafts for principal review.')
 assert.equal(saved.settings.cadence,'weekly')
 assert.equal(saved.settings.dailyLimit,2)
 assert.equal(saved.settings.budgetLimitCents,2500)
 await assert.rejects(()=>store.autopilotSettings('owner','new',{enabled:true,revision:1,dailyLimit:1,accountId:'account',objective:'too short',cadence:'weekly',budgetLimitCents:0}),/invalid_autopilot_settings/)
 await assert.rejects(()=>store.autopilotSettings('owner','new',{enabled:false,revision:0,dailyLimit:1}),/autopilot_settings_conflict/)
 await db.exec(`INSERT INTO amc_iaic.autopilot_settings(brand_id,owner_id,enabled,revision) VALUES
 ('automatic','owner',true,1),('edited','owner',true,2),('manual','owner',true,1),
 ('disabled','owner',false,1),('unknown','owner',true,1),('foreign-policy','owner',true,1);
 INSERT INTO public."AuditLog"(id,"actorType",action,"resourceType","resourceId",metadata) SELECT brand_id,'SYSTEM','AUTOPILOT_DEFAULT_ENABLED','Brand',brand_id,'{"policy":"amcmm-user-ai-default-on-v1"}' FROM amc_iaic.autopilot_settings WHERE brand_id IN ('automatic','edited','manual','disabled');
 INSERT INTO public."AuditLog"(id,"actorType",action,"resourceType","resourceId",metadata) VALUES
 ('manual-save','HUMAN','AUTOPILOT_CONFIGURED','Brand','manual','{}'),
 ('foreign-default','SYSTEM','AUTOPILOT_DEFAULT_ENABLED','Brand','foreign-policy','{"policy":"another-policy"}');`)
 await store.initializeAutopilot(pool)
 const rows=(await db.query<any>('SELECT brand_id,enabled,revision FROM amc_iaic.autopilot_settings')).rows
 const get=(id:string)=>rows.find(row=>row.brand_id===id)!
 assert.equal(get('automatic').enabled,false,'untouched old SYSTEM defaults are disabled')
 assert.equal(get('automatic').revision,2,'migration invalidates stale configuration saves')
 for(const id of ['new','edited','manual','unknown','foreign-policy'])assert.equal(get(id).enabled,true,`preserve explicit or unproven setting: ${id}`)
 assert.equal(get('disabled').enabled,false)
 const audit=await db.query<any>(`SELECT metadata FROM public."AuditLog" WHERE "resourceId"='automatic' AND action='AUTOPILOT_DEFAULT_DISABLED'`)
 assert.equal(audit.rows.length,1);assert.equal(audit.rows[0].metadata.previousEnabled,true)
 await store.initializeAutopilot(pool)
 await store.initializeBrandAutopilotDefault('automatic')
 assert.equal((await db.query<any>(`SELECT count(*)::int AS n FROM public."AuditLog" WHERE "resourceId"='automatic' AND action='AUTOPILOT_DEFAULT_DISABLED'`)).rows[0].n,1,'migration is idempotent')
 assert.equal((await db.query<any>(`SELECT column_default FROM information_schema.columns WHERE table_schema='amc_iaic' AND table_name='autopilot_settings' AND column_name='enabled'`)).rows[0].column_default,'false')
 console.log('PASS: real PostgreSQL defaults and migration, explicit settings preserved, audit and revision idempotence, permission and stale-save guards')
}finally{await db.close()}
