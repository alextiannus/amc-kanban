import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {calendarProjectionSql,calendarMonthProjectionSql,calendarSummarySql,calendarSummaryFields} from '../src/lib/brand-plan/calendarProjection.ts'
import {readBrowseKnowledge} from '../src/lib/ai-native/browse-knowledge.ts'
import {creativeDigest,creativeWorkspace} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {creativeIsSelected,creativeSourceId,dislikedCreativeSources} from '../src/lib/brand-plan/creativeVisibility.ts'
const pg=new PGlite()
try{
 await pg.exec('create table "BrandKnowledge" ("brandId" text,"brandPlan" jsonb,"marketingSolution" jsonb)')
 const candidate={id:'saved',source:{inspirationCreativeId:'cre_a',sourceDigest:'abc'},planning:'full script',nativeSourceSnapshot:{source:{inspirationCreativeId:'cre_a'},keep:'pinned'}}
 const selected={...candidate,id:'selected',planning:'x'.repeat(100000),creativeBrowserSelection:{policy:'creative-browser-v2',reason:'like'}}
 const disliked={...candidate,id:'disliked',brandDismissal:{decision:'dislike',sourceId:'cre_disliked'}}
 const archived={...candidate,id:'archived',status:'归档'},legacy={id:'legacy',planning:'x'.repeat(100000)}
 const items=[candidate,selected,disliked,archived,legacy],old={publishingCalendar:{months:{'2026-10':items}}}
 await pg.query('insert into "BrandKnowledge" values($1,$2,$3)',['brand',old,{unrelated:'x'.repeat(100000)}])
 const db={$queryRawUnsafe:async(sql:string,...params:any[])=>(await pg.query(sql,params)).rows}
 const result=await readBrowseKnowledge(db,'brand'),actual=creativeWorkspace(result).publishingCalendar.months['2026-10']
 assert.deepEqual(actual[0],candidate);assert.equal(creativeDigest(actual[0]),creativeDigest(candidate))
 assert.deepEqual(actual.map(creativeSourceId),items.map(creativeSourceId));assert.deepEqual(actual.map(creativeIsSelected),items.map(creativeIsSelected));assert.deepEqual(dislikedCreativeSources(creativeWorkspace(result)),dislikedCreativeSources(old))
 assert.equal(actual[1].planning,undefined);assert.equal(actual[3].planning,undefined);assert.equal(actual[4].planning,undefined)
 assert(JSON.stringify(result).length<2000)
 await pg.query('update "BrandKnowledge" set "marketingSolution"=$1',[{publishingCalendar:{months:{'2026-11':[candidate]}}}])
 assert.deepEqual(Object.keys(creativeWorkspace(await readBrowseKnowledge(db,'brand')).publishingCalendar.months),['2026-11'])
 const raw=(await pg.query(calendarProjectionSql,['brand'])).rows[0] as any
 const monthly=(await pg.query(calendarMonthProjectionSql,['brand','2026-11'])).rows[0] as any
 assert.deepEqual(raw.marketingSolution,monthly.marketingSolution)
 assert.equal(creativeDigest(monthly.marketingSolution.publishingCalendar.months['2026-11'][0]),creativeDigest(candidate))
 const summary=(await pg.query(calendarSummarySql,['brand'])).rows[0] as any
 assert.deepEqual(summary.marketingSolution.publishingCalendar.months['2026-11'][0],Object.fromEntries(Object.entries(candidate).filter(([key])=>calendarSummaryFields.includes(key))))
 console.log('PASS SQL calendar projection: exact candidate digest, selected/disliked identity parity, legacy merge, tiny payload, no writes')
}finally{await pg.close()}
