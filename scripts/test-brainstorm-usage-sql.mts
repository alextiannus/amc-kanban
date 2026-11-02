import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {brainstormWorkspaceSql,brainstormUsage} from '../src/lib/ai-native/brainstorm-usage.ts'
import {readBrowseKnowledge} from '../src/lib/ai-native/browse-knowledge.ts'
const pg=new PGlite()
try{
 await pg.exec(`create table "BrandKnowledge" ("brandId" text,"brandPlan" jsonb,"marketingSolution" jsonb);
 create schema amc_iaic;
 create table amc_iaic.iaic_workspace_heads(application_id text,assistant_id text,subject_id text,path text,revision int,deleted boolean);
 create table amc_iaic.iaic_workspace_versions(application_id text,assistant_id text,subject_id text,path text,revision int,content text,media_type text,created_at timestamptz);`)
 const item={id:'copy',title:'Edited title',planning:'large script'.repeat(100000),source:{inspirationCreativeId:'cre_video',sourceDigest:'a'.repeat(64)},nativeSourceSnapshot:{source:{raw:'x'.repeat(1000000)}},replicationCopy:{at:'2026-11-02T01:00:00Z'},creativeBrowserSelection:{policy:'creative-browser-v2',reason:'like'},updatedAt:'2026-11-02T01:00:00Z'}
 await pg.query('insert into "BrandKnowledge" values($1,null,$2)',['brand',{publishingCalendar:{months:{'2026-11':[item]}}}])
 const db={$queryRawUnsafe:async(sql:string,...params:any[])=>(await pg.query(sql,params)).rows}
 const projected:any=await readBrowseKnowledge(db,'brand'),entry=projected.marketingSolution.publishingCalendar.months['2026-11'][0]
 assert.equal(entry.planning,undefined);assert.equal(entry.nativeSourceSnapshot.source.raw,undefined);assert(JSON.stringify(projected).length<1000)
 assert.deepEqual(brainstormUsage([{month:'2026-11',item:entry}],'cre_video'),brainstormUsage([{month:'2026-11',item}],'cre_video'))
 const app=JSON.stringify(['amc-mm','documents','brand']),subject=JSON.stringify(['user','owner'])
 async function doc(path:string,application=app,actor=subject,deleted=false,revision=1,creativeId='copy',when='2026-11-02T01:00:00Z'){
  await pg.query('insert into amc_iaic.iaic_workspace_heads values($1,$2,$3,$4,$5,$6)',[application,'merchant-workspace',actor,path,revision,deleted])
  await pg.query('insert into amc_iaic.iaic_workspace_versions values($1,$2,$3,$4,$5,$6,$7,$8)',[application,'merchant-workspace',actor,path,revision,JSON.stringify({creativeId,sourceLineage:{creativeRevisionId:'revision-'+revision,sourceMonth:'2026-11'},script:'must not leave database'}),'application/json',when])
 }
 await doc('video/older');await doc('video/latest',app,subject,false,2,'copy','2026-11-02T02:00:00Z')
 await doc('video/foreign',JSON.stringify(['amc-mm','documents','other']))
 await doc('video/another-owner',app,JSON.stringify(['user','another']))
 await doc('video/deleted',app,subject,true,1,'copy','2026-11-02T03:00:00Z')
 await doc('video/different-creative',app,subject,false,1,'other','2026-11-02T04:00:00Z')
 assert.deepEqual((await pg.query(brainstormWorkspaceSql,[app,subject,'copy'])).rows,[{id:'latest',creativeRevisionId:'revision-2',sourceMonth:'2026-11'}])
 assert.deepEqual((await pg.query(brainstormWorkspaceSql,[app,subject,'missing'])).rows,[])
 console.log('PASS real SQL: compact selected/copy metadata, latest workspace only, brand/owner/creative isolation, deleted workspace exclusion and no script disclosure')
}finally{await pg.close()}
