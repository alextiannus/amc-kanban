import assert from 'node:assert/strict'
import {nativePool} from '../src/lib/ai-native/store.ts'
import {prisma} from '../src/lib/prisma.ts'
import {creativeDirection,duplicateCreative} from '../src/lib/ai-native/creative-diversity.ts'
import {readCreativeRevisions} from '../src/lib/brand-plan/creativeRevisions.ts'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'))
const pool=nativePool()
try{
 const rows=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE replaced_at IS NULL ORDER BY created_at DESC')).rows
 const brands=new Set(rows.map(row=>row.brand_id));let directionViolations=0,duplicates=0
 for(const brand of brands){const items=rows.filter(row=>row.brand_id===brand),counts:Record<string,number>={};assert(items.length<=18);for(let n=0;n<items.length;n++){const direction=creativeDirection(items[n].source);counts[direction]=(counts[direction]||0)+1;duplicates+=items.slice(0,n).filter(other=>duplicateCreative(other.source,items[n].source)).length}directionViolations+=Object.values(counts).filter(count=>count>2).length}
 const completed=rows.filter(row=>row.plan_id)
 const errors=rows.filter(row=>row.last_error).reduce((counts,row)=>({...counts,[row.last_error]:(counts[row.last_error]||0)+1}),{})
 console.log(JSON.stringify({phase:'resident-pool',brands:brands.size,ideas:rows.length,automaticallyPlanned:completed.length,directionViolations,duplicates,states:errors}))
 assert.equal(directionViolations,0);assert.equal(duplicates,0)
 assert(completed.length>0,'No automatic plan is complete yet; inspect resident progress later')
 let verified=0
 for(const row of completed.slice(0,5)){
  const revision=await readCreativeRevisions({id:row.owner_id,type:'HUMAN'},row.brand_id,row.plan_month,row.plan_id)
  const adapted=revision.revisions.find(item=>item.actor.type==='AI'&&item.ai?.taskId===row.task_id)
  assert(adapted);assert.equal(adapted.source.creativeId,row.source_id);assert(adapted.principals.some((item:any)=>item.userId===row.owner_id))
  const content:any=adapted.content;assert(content.planning?.trim());assert(content.materialRequirements?.length);assert.equal(content.nativeReviewStatus,'pending_review')
  const binding=(await pool.query('SELECT intent FROM amc_ai_requests WHERE task_id=$1',[row.task_id])).rows[0];assert.equal(binding.intent.automaticDaily,true)
  verified++
 }
 console.log(JSON.stringify({ok:true,verifiedAutomaticPlans:verified,checks:['resident automatic enrollment','AI actor and principal lineage','original creative linkage','adapted scripts and materials','pending human review','source deduplication','two per direction']}))
}finally{await pool.end();await prisma.$disconnect()}
