import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {creativeDigest,creativeWorkspace,record} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {normalizeCreativeWorkspaceItem} from '../src/lib/brand-plan/creativeWorkspaceContract.ts'
import {hasCreativeDraftMarker} from '../src/lib/brand-plan/creativeDraftMarker.ts'

type Sql = {query:(sql:string,params?:unknown[])=>Promise<{rows:any[]}>}
export type MigrationDatabase = Sql & {transaction:<T>(fn:(tx:Sql)=>Promise<T>,readOnly:boolean)=>Promise<T>}
type Options = {apply?:boolean;brandId?:string}
const VERSION=1
const ACTION='CREATIVE_WORKSPACE_LEGACY_MIGRATED'

export function parseMigrationArgs(args:string[]):Options {
  const options:Options={apply:false}
  if(args.includes('--apply')&&args.includes('--dry-run'))throw Error('conflicting migration modes')
  for(let i=0;i<args.length;i++){
    if(args[i]==='--apply')options.apply=true
    else if(args[i]==='--dry-run')continue
    else if(args[i]==='--brand-id'&&args[i+1]&&!args[i+1].startsWith('--'))options.brandId=args[++i]
    else throw Error(`unknown migration argument: ${args[i]}`)
  }
  return options
}

function project(knowledge:any,drafts:any[]) {
  const workspace=creativeWorkspace(knowledge),months=record(workspace.publishingCalendar?.months)
  const entries=Object.entries(months).flatMap(([month,items])=>Array.isArray(items)?items.map((item:any,index)=>({month,index,item:record(item)})):[])
  const findings:any[]=[]
  const nextMonths={...months}
  for(const [month,items] of Object.entries(months)){
    if(!Array.isArray(items)){findings.push({month,creativeId:null,classification:'invalid',migrationStatus:'needs_confirmation',issues:['invalid_month_items']});continue}
    nextMonths[month]=items.map((raw:any)=>{
      const item=record(raw),id=typeof item.id==='string'?item.id:''
      // Completed projections are immutable migration evidence. Later ordinary
      // saves retain this record, and never cause another migration audit.
      if(item.workspaceMigration?.version===VERSION){findings.push({month,creativeId:id,...item.workspaceMigration.result});return raw}
      const issues:string[]=[]
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!id||id.length>200){findings.push({month,creativeId:id||null,classification:'invalid',migrationStatus:'needs_confirmation',issues:['invalid_creative_identity']});return raw}
      if(items.filter(row=>row?.id===id).length!==1){findings.push({month,creativeId:id,classification:'ambiguous',migrationStatus:'needs_confirmation',issues:['duplicate_creative_identity']});return raw}
      const normalized=normalizeCreativeWorkspaceItem(item,{brandId:knowledge.brandId})
      const dated=Boolean(normalized.legacy?.date),hasLegacy=Boolean(normalized.legacy)
      // Existing canonical items already have an authority-owned schedule. Do
      // not reinterpret that state or stamp migration metadata on new work.
      if(!hasLegacy&&Object.hasOwn(item,'schedule')&&Object.hasOwn(item,'platformTargets')){
        findings.push({month,creativeId:id,classification:'current',migrationStatus:'unchanged',issues:[]});return raw
      }
      const candidates=drafts.filter(draft=>hasCreativeDraftMarker(draft.agentNote,'calendar',id))
      let schedule=normalized.schedule
      let classification=dated?'dated':'undated'
      if(!schedule&&candidates.length){
        classification=candidates.length===1?'linked':'ambiguous'
        if(candidates.length!==1)issues.push('multiple_draft_links')
        else {
          const draft=candidates[0]
          const identities=entries.filter(entry=>hasCreativeDraftMarker(draft.agentNote,'calendar',entry.item.id)).length
          const otherOwner=entries.some(entry=>(entry.month!==month||entry.item.id!==id)&&entry.item.schedule?.draftId===draft.id)
          if(identities!==1||otherOwner)issues.push('draft_identity_ambiguous')
          if(!draft.platformId||draft.accountBrandId!==knowledge.brandId)issues.push('draft_account_unresolved')
          if(!issues.length)schedule={draftId:draft.id,scheduledAt:draft.scheduledAt?new Date(draft.scheduledAt).toISOString():null,platform:draft.platformId,scheduledBy:null,scheduledAtRevisionId:null,legacy:true}
        }
      }else if(!schedule&&dated)issues.push('draft_link_unresolved')
      const migrationStatus=issues.length?'needs_confirmation':'migrated'
      const result={classification,migrationStatus,issues}
      findings.push({month,creativeId:id,...result})
      const next={...item,status:normalized.status,platformTargets:normalized.platformTargets,source:normalized.source,skuDecision:normalized.skuDecision,schedule,...(normalized.legacy?{legacy:normalized.legacy}:{}),migrationStatus,workspaceMigration:{version:VERSION,result}}
      // Preserve all original evidence fields and every historical revision;
      // only the dated compatibility fields move under the legacy projection.
      delete next.date;delete next.platform;delete next.platformSlug
      return next
    })
  }
  const next={...workspace,publishingCalendar:{...workspace.publishingCalendar,months:nextMonths}}
  return {next,findings,changed:creativeDigest(next)!==creativeDigest(workspace)}
}

export async function runCreativeWorkspaceMigration(db:MigrationDatabase,options:Options={}) {
  // Discovery does not mutate, even when the caller has supplied --apply.
  const brands=(await db.query('SELECT "brandId" FROM "BrandKnowledge"'+(options.brandId?' WHERE "brandId" = $1':'')+' ORDER BY "brandId"',options.brandId?[options.brandId]:[])).rows
  const findings:any[]=[];let writtenBrands=0,wouldChangeBrands=0
  for(const {brandId} of brands){
    const result=await db.transaction(async tx=>{
      // Identical lock order to creative saves and explicit scheduling. Lock
      // drafts as well, so a concurrent legacy draft edit cannot change the
      // evidence between projection and audit. Dry runs acquire no row locks.
      const knowledge=(await tx.query('SELECT "id", "brandId", "marketingSolution", "brandPlan" FROM "BrandKnowledge" WHERE "brandId" = $1'+(options.apply?' FOR UPDATE':''),[brandId])).rows[0]
      if(!knowledge)return null
      const drafts=(await tx.query('SELECT d.id,d."agentNote",d."scheduledAt",a."platformId",a."brandId" AS "accountBrandId" FROM "ContentDraft" d LEFT JOIN "SocialAccount" a ON a.id=d."accountId" WHERE d."brandId" = $1 ORDER BY d.id'+(options.apply?' FOR UPDATE OF d':''),[brandId])).rows
      const projected=project(knowledge,drafts)
      if(options.apply&&projected.changed){
        const before=creativeWorkspace(knowledge),beforeDigest=creativeDigest(before),afterDigest=creativeDigest(projected.next)
        await tx.query('UPDATE "BrandKnowledge" SET "marketingSolution"=$1::jsonb,"updatedAt"=CURRENT_TIMESTAMP WHERE "brandId"=$2',[JSON.stringify(projected.next),brandId])
        await tx.query('INSERT INTO "AuditLog" (id,"actorId","actorType",action,"resourceId","resourceType","oldValue","newValue",metadata) VALUES ($1,NULL,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)',[randomUUID(),'SYSTEM',ACTION,brandId,'BrandKnowledge',JSON.stringify({digest:beforeDigest}),JSON.stringify({digest:afterDigest}),JSON.stringify({migrationVersion:VERSION,brandId,requestKey:creativeDigest([ACTION,brandId,beforeDigest,afterDigest]),findings:projected.findings})])
        const verified=(await tx.query('SELECT "marketingSolution" FROM "BrandKnowledge" WHERE "brandId"=$1',[brandId])).rows[0]
        if(creativeDigest(verified.marketingSolution)!==afterDigest)throw Error('creative_migration_readback_failed')
      }
      return projected
    },!options.apply)
    if(result){findings.push(...result.findings.map(row=>({brandId,...row})));if(result.changed){wouldChangeBrands++;if(options.apply)writtenBrands++}}
  }
  const summary={brands:brands.length,total:findings.length,dated:0,linked:0,ambiguous:0,undated:0,current:0,invalid:0,needs_confirmation:0}
  for(const finding of findings){summary[finding.classification as 'dated']++;if(finding.migrationStatus==='needs_confirmation')summary.needs_confirmation++}
  return {mode:options.apply?'apply':'dry-run',migrationVersion:VERSION,summary,wouldChangeBrands,writtenBrands,findings}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const options=parseMigrationArgs(process.argv.slice(2))
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required; no implicit environment file is loaded')
  const {Pool}=await import('pg'),pool=new Pool({connectionString:process.env.DATABASE_URL,max:2})
  const db:MigrationDatabase={query:(sql,params)=>pool.query(sql,params),transaction:async(fn,readOnly)=>{
    const client=await pool.connect()
    try{await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await client.query("SET LOCAL lock_timeout = '5s'");await client.query("SET LOCAL statement_timeout = '15s'");const result=await fn(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }}
  try{console.log(JSON.stringify(await runCreativeWorkspaceMigration(db,options),null,2))}finally{await pool.end()}
}
