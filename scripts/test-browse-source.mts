import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {browseFeedSql,browsePoolSql} from '../src/lib/ai-native/browse-source.ts'
import {projectBrainstormSource,eligibleBrainstormSource} from '../src/lib/ai-native/brainstorm-contract.ts'
const db=new PGlite()
try{
 await db.exec(`create schema amc_iaic;create table "BrandMarketingSolution" ("brandId" text,kind text,period text,version int,input jsonb,output jsonb,"createdAt" timestamptz default now());create table amc_iaic.brand_ideas(id text,source_id text,source jsonb,match_id text,brand_id text,replaced_at timestamptz,selected_at timestamptz,created_at timestamptz default now())`)
 const raw={inspirationCreativeId:'cre_one',sourceRevision:'r1',sourceDigest:'a'.repeat(64),matchScore:90,sourceVideo:{title:'Video',platform:'tiktok',videoUrl:'https://example.test/v.mp4'},sourceEvidence:{originalText:'prior snapshot',analysis:'x'.repeat(100000),timeline:[{narrativePurpose:'Opening',description:'x'.repeat(100000)},{narrativePurpose:'Product'}]},scriptContent:{opening:'Hook'},recommendationReason:'Relevant'}
 await db.query(`insert into "BrandMarketingSolution"("brandId",kind,period,version,input,output) values($1,'BRAINSTORM_FEED','sources',1,'{}',$2)`,['brand',{sources:[raw]}])
 await db.query(`insert into amc_iaic.brand_ideas(id,source_id,source,match_id,brand_id) values('pool','cre_one',$1,'match','brand')`,[raw])
 const feed:any=(await db.query(browseFeedSql,['brand'])).rows[0],pool:any=(await db.query(browsePoolSql,['brand'])).rows[0]
 for(const source of [feed.output.sources[0],pool.source]){
  assert(eligibleBrainstormSource(source));assert.equal(source.sourceDigest,raw.sourceDigest);assert.equal(source.sourceRevision,raw.sourceRevision)
  assert.deepEqual({...projectBrainstormSource(source,'brand',null),originalScript:''},{...projectBrainstormSource(raw,'brand',null),originalScript:''})
  assert(JSON.stringify(source).length<2000)
 }
 assert.equal((await db.query(browseFeedSql,['other'])).rows.length,0);assert.equal((await db.query(browsePoolSql,['other'])).rows.length,0)
 console.log('PASS feed/pool SQL projection: source pins, list metadata and recommendation parity, brand isolation, small payload')
}finally{await db.close()}
