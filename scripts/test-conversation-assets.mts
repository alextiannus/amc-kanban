import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {brandAssets,canReadAssets} from '../src/lib/ai-native/assets.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {allowedTaskTools} from '../src/lib/ai-native/task-tools.ts'
const id='asset-test-'+randomUUID(),other=id+'-other',actor=actorFor(id,id)
try{
 await prisma.brand.createMany({data:[{id,name:'Asset fixture'},{id:other,name:'Other brand'}]})
 await prisma.mediaAsset.createMany({data:Array.from({length:32},(_,i)=>({id:id+'-'+String(i).padStart(2,'0'),brandId:id,url:'/fixture.jpg',filename:'IMG_'+i+'.jpeg',mimeType:'image/jpeg',aiCaption:i===31?'Haidilao gathering':'Stored caption'})).concat([{id:other,brandId:other,url:'/other.jpg',filename:'IMG_31.jpeg',mimeType:'image/jpeg',aiCaption:'secret other brand'}])})
 const first=await brandAssets(actor,{})
 assert.equal(first.total,32);assert.equal(first.matchingTotal,32);assert.equal(first.assets.length,30);assert(first.nextCursor)
 const next=await brandAssets(actor,{after:first.nextCursor!});assert.equal(next.assets.length,2);assert.equal(next.nextCursor,null)
 assert.equal(new Set([...first.assets,...next.assets].map(a=>a.id)).size,32)
 const match=await brandAssets(actor,{query:'haidilao'});assert.equal(match.matchingTotal,1);assert.equal(match.assets[0].filename,'IMG_31.jpeg')
 const missing=await brandAssets(actor,{query:'unmatched'});assert.equal(missing.total,32);assert.equal(missing.matchingTotal,0)
 const foreignCursor=await brandAssets(actor,{after:other});assert(foreignCursor.assets.every(a=>a.id!==other))
 await assert.rejects(()=>brandAssets(actor,{query:'x'.repeat(201)}),/asset_query_invalid/)
 assert.equal(await canReadAssets(actor),false,'nonexistent user denied')
 const tools=['amc.assets','amc.operations','amc.library','amc.documents','amc.creative','amc.video_facts','amc.autopilot.save']
 const selected=allowedTaskTools(tools,{kind:'conversation'} as any,['amc.autopilot.save'])
 assert.deepEqual(selected,['amc.assets','amc.operations','amc.documents'])
 assert(!allowedTaskTools(tools,{kind:'video_rewrite'} as any,[]).includes('amc.assets'))
 assert(!allowedTaskTools(tools,{kind:'creative_discovery'} as any,[]).includes('amc.assets'))
 console.log('PASS conversation asset pagination, cross-brand isolation, case-insensitive lookup, exact empty semantics, validation and task tool selection')
}finally{await prisma.brand.deleteMany({where:{id:{in:[id,other]}}});await prisma.$disconnect()}
