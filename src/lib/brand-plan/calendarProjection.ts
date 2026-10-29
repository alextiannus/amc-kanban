/** Read projection only; full calendar items retain their original revision digest. */
// Extract the calendar once instead of copying the entire workspace JSON.
const calendarValueSql=`select coalesce("marketingSolution"->'publishingCalendar',"brandPlan"->'publishingCalendar') as value from "BrandKnowledge" where "brandId"=$1`
export const calendarProjectionSql=`with calendar as materialized (${calendarValueSql}) select jsonb_build_object('publishingCalendar',value) as "marketingSolution" from calendar`
export const calendarMonthProjectionSql=`with calendar as materialized (${calendarValueSql}) select jsonb_build_object('publishingCalendar',jsonb_build_object('months',jsonb_build_object($2::text,value->'months'->$2::text))) as "marketingSolution" from calendar`

// Homepage compatibility list only consumes these fields; editing uses authoritative detail.
export const calendarSummaryFields=['id','date','brainstorm','brandDismissal','creativeBrowserSelection','platformSlug','platform','title','contentType','product','planning','materialRequirements','matchedTags','aiTags','aiCaption','historical','revisionId','month','productionFormats','draftId','postUrl']
export const calendarSummarySql=`with calendar as materialized (${calendarValueSql}), months as materialized (
 select m.key, m.value from calendar c cross join lateral jsonb_each(case when jsonb_typeof(c.value->'months')='object' then c.value->'months' else '{}'::jsonb end) m
), projected as materialized (
 select key,coalesce((select jsonb_agg((select coalesce(jsonb_object_agg(f.key,i->f.key),'{}'::jsonb) from unnest(array[${calendarSummaryFields.map(f=>"'"+f+"'").join(',')}]::text[]) f(key) where jsonb_typeof(i)='object' and i ? f.key) order by ord)
 from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end) with ordinality a(i,ord)),'[]'::jsonb) as items from months
) select jsonb_build_object('publishingCalendar',jsonb_build_object('months',coalesce(jsonb_object_agg(key,items),'{}'::jsonb))) as "marketingSolution" from projected`
