import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {nativePreference,getNativeHost} from '../src/lib/ai-native/service.ts'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'))
const id='amc-settings-acceptance-'+randomUUID(),name='AMC workspace settings acceptance (archived)'
let host:Awaited<ReturnType<typeof getNativeHost>>|undefined
try{
 await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name,industry:'restaurant',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{brandTone:'Factual',audienceAssumptions:'Families'}}}})
 host=await getNativeHost();assert((await host.app.runtime.drain({timeoutMs:5000})).drained)
 const initial=await nativePreference(id,id);assert.equal(initial.status,'absent');assert.equal(initial.revision,0);assert.equal(initial.source,'brand');assert.match(initial.effectiveContent!,/Families/)
 const body={action:'remember',expectedRevision:0,content:'Use concise factual wording.'}
 const saved=await nativePreference(id,id,body),again=await nativePreference(id,id,body);assert.equal(saved.revision,again.revision);assert.equal(saved.source,'personal');assert.equal((await nativePreference(id,id)).effectiveContent,body.content)
 const reset=await nativePreference(id,id,{action:'forget',expectedRevision:saved.revision});assert.equal(reset.status,'forgotten');assert.equal(reset.content,null);assert.equal(reset.source,'brand')
 await assert.rejects(()=>nativePreference(id,id,body))
 await prisma.brandKnowledge.update({where:{brandId:id},data:{brandTone:'Warm and clear'}})
 const updated=await nativePreference(id,id);assert.match(updated.effectiveContent!,/Warm and clear/);assert.equal(updated.revision,reset.revision)
 await assert.rejects(()=>nativePreference(id,'not-this-brand'))
 assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
 console.log(JSON.stringify({ok:true,checks:['brand defaults without memory write','custom save and exact replay','persistent readback','forget and old-write refusal','current brand refresh','cross-brand authorization'],noModelCalls:true,noPublication:true}))
}finally{
 const fixture=await prisma.brand.findUnique({where:{id}})
 if(fixture){assert.equal(fixture.name,name);assert.equal(fixture.status,'ARCHIVED');assert.equal(fixture.autoPilot,false);await prisma.brand.delete({where:{id}})}
 await prisma.user.deleteMany({where:{id}})
 if(host){const drained=await host.app.runtime.drain({timeoutMs:5000});if(drained.drained)await host.pool.end()}
 await prisma.$disconnect();console.log(JSON.stringify({fixtureCleaned:true}))
}
