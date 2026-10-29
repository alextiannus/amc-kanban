/** Read projection only; full calendar items retain their original revision digest. */
export const calendarProjectionSql=`select jsonb_build_object('publishingCalendar',
 case when jsonb_typeof("marketingSolution")='object' and "marketingSolution" ? 'publishingCalendar'
 then "marketingSolution"->'publishingCalendar' else "brandPlan"->'publishingCalendar' end) as "marketingSolution"
 from "BrandKnowledge" where "brandId"=$1`
export const calendarMonthProjectionSql=`select jsonb_build_object('publishingCalendar',jsonb_build_object('months',jsonb_build_object($2::text,
 (case when jsonb_typeof("marketingSolution")='object' and "marketingSolution" ? 'publishingCalendar'
 then "marketingSolution"->'publishingCalendar' else "brandPlan"->'publishingCalendar' end)->'months'->$2::text))) as "marketingSolution"
 from "BrandKnowledge" where "brandId"=$1`

// Homepage compatibility list only consumes these fields; editing uses authoritative detail.
export const calendarSummaryFields=['id','date','brainstorm','brandDismissal','creativeBrowserSelection','platformSlug','platform','title','contentType','product','planning','materialRequirements','matchedTags','aiTags','aiCaption','historical','revisionId','month','productionFormats','draftId','postUrl']
export const calendarSummarySql=`with calendar as (${calendarProjectionSql}), months as (
 select m.key, m.value from calendar c cross join lateral jsonb_each(case when jsonb_typeof(c."marketingSolution"->'publishingCalendar'->'months')='object' then c."marketingSolution"->'publishingCalendar'->'months' else '{}'::jsonb end) m
), projected as (
 select key,coalesce((select jsonb_agg((select coalesce(jsonb_object_agg(f.key,f.value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(i)='object' then i else '{}'::jsonb end) f where f.key=any(array[${calendarSummaryFields.map(f=>"'"+f+"'").join(',')}]::text[])) order by ord)
 from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end) with ordinality a(i,ord)),'[]'::jsonb) as items from months
) select jsonb_build_object('publishingCalendar',jsonb_build_object('months',coalesce(jsonb_object_agg(key,items),'{}'::jsonb))) as "marketingSolution" from projected`
