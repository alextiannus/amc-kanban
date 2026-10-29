/** Read projection only; full calendar items retain their original revision digest. */
// Extract the calendar once instead of copying the entire workspace JSON.
const calendarValueSql=`select coalesce("marketingSolution"->'publishingCalendar',"brandPlan"->'publishingCalendar') as value from "BrandKnowledge" where "brandId"=$1`
export const calendarProjectionSql=`with calendar as materialized (${calendarValueSql}) select jsonb_build_object('publishingCalendar',value) as "marketingSolution" from calendar`
export const calendarMonthProjectionSql=`with calendar as materialized (${calendarValueSql}) select value #> array['months',$2::text] as items from calendar`

// Homepage compatibility list only consumes these fields; editing uses authoritative detail.
export const calendarSummaryFields=['id','date','brainstorm','brandDismissal','creativeBrowserSelection','platformSlug','platform','title','contentType','product','planning','materialRequirements','matchedTags','aiTags','aiCaption','historical','revisionId','month','productionFormats','draftId','postUrl']
export const calendarSummarySql=`with calendar as materialized (${calendarValueSql}), months as materialized (
 select m.key, m.value from calendar c cross join lateral jsonb_each(case when jsonb_typeof(c.value->'months')='object' then c.value->'months' else '{}'::jsonb end) m
), projected as materialized (
 select key,coalesce((select jsonb_agg((select coalesce(jsonb_object_agg(f.key,i->f.key),'{}'::jsonb) from unnest(array[${calendarSummaryFields.map(f=>"'"+f+"'").join(',')}]::text[]) f(key) where jsonb_typeof(i)='object' and i ? f.key) order by ord)
 from jsonb_array_elements(case when jsonb_typeof(value)='array' then value else '[]'::jsonb end) with ordinality a(i,ord)),'[]'::jsonb) as items from months
) select jsonb_build_object('publishingCalendar',jsonb_build_object('months',coalesce(jsonb_object_agg(key,items),'{}'::jsonb))) as "marketingSolution" from projected`

// Share only in-flight authorized data reads, never permission checks or completed results.
// Large legacy calendars must not be detoasted concurrently by every open page.
type CalendarReadState={busy:boolean;queue:Array<{start:()=>void;timer:ReturnType<typeof setTimeout>}>;reads:WeakMap<object,Map<string,Promise<any[]>>>}
const calendarGlobal=globalThis as typeof globalThis&{__amcCalendarReads?:CalendarReadState}
const calendarReads=calendarGlobal.__amcCalendarReads??={busy:false,queue:[],reads:new WeakMap()}
function acquireCalendarRead():Promise<()=>void>{
 return new Promise((resolve,reject)=>{
  const start=()=>{calendarReads.busy=true;let released=false;resolve(()=>{if(released)return;released=true;const next=calendarReads.queue.shift();if(next){clearTimeout(next.timer);next.start()}else calendarReads.busy=false})}
  if(!calendarReads.busy){start();return}
  if(calendarReads.queue.length>=16){reject(Object.assign(new Error('Calendar reads busy'),{code:'calendar_read_busy',status:503}));return}
  const entry={start,timer:setTimeout(()=>{const index=calendarReads.queue.indexOf(entry);if(index>=0)calendarReads.queue.splice(index,1);reject(Object.assign(new Error('Calendar read queue timed out'),{code:'calendar_read_busy',status:503}))},6000)}
  calendarReads.queue.push(entry)
 })
}
export async function queryCalendarRead(db:any,sql:string,...parameters:string[]):Promise<any[]>{
 let reads=calendarReads.reads.get(db);if(!reads){reads=new Map();calendarReads.reads.set(db,reads)}
 const key=JSON.stringify([sql,...parameters]);let request=reads.get(key)
 if(!request){
  request=(async()=>{const release=await acquireCalendarRead();try{return await db.$queryRawUnsafe(sql,...parameters)}finally{release()}})()
  reads.set(key,request)
  void request.finally(()=>{if(reads!.get(key)===request)reads!.delete(key)}).catch(()=>{})
 }
 return structuredClone(await request)
}
