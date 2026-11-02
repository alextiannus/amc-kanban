import {creativeIsSelected,creativeSourceId} from '../brand-plan/creativeVisibility'

export type BrandCreativeUsage={
 status:'selected'|'replicated';count:number
 creatives:{creativeId:string;month:string;title:string;updatedAt:string}[]
}
export const activeBrowseCreative=(item:any)=>!!item&&item.brandDismissal?.decision!=='dislike'&&!['archived','deleted','归档','已删除'].includes(item.status)

/** Brand usage is live metadata. Never use an edited copy as discovery evidence. */
export function brainstormUsage(entries:{month:string;item:any}[],sourceId:string,choice?:any):BrandCreativeUsage|undefined{
 const seen=new Set<string>()
 const records=entries.filter(({item})=>activeBrowseCreative(item)&&creativeSourceId(item)===sourceId&&(creativeIsSelected(item)||!!item.replicationCopy))
  .sort((a,b)=>String(b.item.updatedAt||b.item.createdAt||'').localeCompare(String(a.item.updatedAt||a.item.createdAt||''))||String(a.item.id).localeCompare(String(b.item.id)))
  .filter(({item})=>typeof item.id==='string'&&!seen.has(item.id)&&!!seen.add(item.id))
 if(!records.length&&choice?.input?.decision!=='like')return undefined
 return {status:records.some(({item})=>!!item.replicationCopy)?'replicated':'selected',count:records.length,
  creatives:records.map(({month,item})=>({creativeId:item.id,month,title:item.title||'',updatedAt:item.updatedAt||item.createdAt||''}))}
}

export function withBrainstormUsage(items:any[],entries:{month:string;item:any}[],choices:any[]){
 const byId=new Map(choices.map(c=>[c.period,c]))
 return items.map(item=>{const {brandUsage:_old,...idea}=item;const brandUsage=brainstormUsage(entries,item.sourceId,byId.get(item.sourceId));return {...idea,...(brandUsage?{brandUsage}:{})}})
}

export const brainstormWorkspaceSql=`
 select substring(h.path from 7) as id,draft.value->'sourceLineage'->>'creativeRevisionId' as "creativeRevisionId",draft.value->'sourceLineage'->>'sourceMonth' as "sourceMonth"
 from amc_iaic.iaic_workspace_heads h join amc_iaic.iaic_workspace_versions v using(application_id,assistant_id,subject_id,path,revision)
 cross join lateral (select case when v.media_type='application/json' then v.content::jsonb else '{}'::jsonb end as value) draft
 where h.application_id=$1 and h.assistant_id='merchant-workspace' and h.subject_id=$2 and not h.deleted
   and h.path like 'video/%' and draft.value->>'creativeId'=$3
 order by v.created_at desc,h.path limit 1
`
