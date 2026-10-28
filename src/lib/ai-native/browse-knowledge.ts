/** Read-only projection. Writes must always read the complete workspace. */
export const browseKnowledgeSql=`
with workspace as (
 select coalesce("brandPlan",'{}'::jsonb)||coalesce("marketingSolution",'{}'::jsonb) as value
 from "BrandKnowledge" where "brandId"=$1
), months as (
 select m.key as month,m.value
 from workspace w cross join lateral jsonb_each(case when jsonb_typeof(w.value->'publishingCalendar'->'months')='object' then w.value->'publishingCalendar'->'months' else '{}'::jsonb end) m
), projected as (
 select month,coalesce(jsonb_agg(case when
   (i->'brandDismissal'->>'decision'='dislike') or
   (i->'creativeBrowserSelection'->>'policy'='creative-browser-v2' and i->'creativeBrowserSelection'->>'reason'='like') or
   i->>'status' in ('archived','deleted','归档','已删除') or
   coalesce(nullif(i->>'inspirationCreativeId',''),nullif(i->'source'->>'inspirationCreativeId',''),nullif(i->'nativeSourceSnapshot'->'source'->>'inspirationCreativeId',''),'') !~ '^cre_[a-zA-Z0-9_-]+$'
 then jsonb_build_object('id',i->'id','status',i->'status','brandDismissal',i->'brandDismissal','creativeBrowserSelection',i->'creativeBrowserSelection',
  'inspirationCreativeId',i->'inspirationCreativeId','source',jsonb_build_object('inspirationCreativeId',i->'source'->'inspirationCreativeId'),
  'nativeSourceSnapshot',jsonb_build_object('source',jsonb_build_object('inspirationCreativeId',i->'nativeSourceSnapshot'->'source'->'inspirationCreativeId')))
 else i end order by ord) filter(where i is not null),'[]'::jsonb) as items
 from months left join lateral jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end) with ordinality a(i,ord) on true group by month
)
select jsonb_build_object('publishingCalendar',jsonb_build_object('months',coalesce(jsonb_object_agg(month,items),'{}'::jsonb))) as "marketingSolution" from projected
`
export async function readBrowseKnowledge(db:any,brandId:string){
 if(!db.$queryRawUnsafe)return db.brandKnowledge.findUnique({where:{brandId}})
 return (await db.$queryRawUnsafe(browseKnowledgeSql,brandId))[0]||null
}
