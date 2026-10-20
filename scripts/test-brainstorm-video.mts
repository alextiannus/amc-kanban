import assert from 'node:assert/strict'
import {resolveBrainstormVideos} from '../src/lib/ai-native/brainstorm-video.ts'
const hash='a'.repeat(64)
const reference=(id:string)=>({inspirationCreativeId:id,sourceRevision:'r1',sourceDigest:hash})
const saved=(id:string,sourceId?:string)=>({idea:{sourceId:sourceId||'saved_fake',savedCreativeId:id,title:id,originalScript:''},current:{id,title:id,planning:'Brand script retained',...(sourceId?{source:reference(sourceId)}:{})}})
const before=[saved('empty'),saved('restored','cre_good'),saved('duplicate','cre_good'),saved('missing','cre_missing'),saved('no-media','cre_nomedia'),saved('changed','cre_changed'),saved('offline','cre_offline'),saved('conflict','cre_good')]
before.at(-1)!.current.inspirationCreativeId='cre_other'
const snapshot=structuredClone(before),calls:string[]=[]
const read=async(id:string)=>{calls.push(id);if(id==='cre_missing')throw Error('original_evidence_not_found');if(id==='cre_offline')throw Error('original_evidence_unavailable');return {creativeId:id,sourceRevision:id==='cre_changed'?'r2':'r1',sourceDigest:hash,originalVideoUrl:id==='cre_nomedia'?null:'https://robotics.obs.ap-southeast-3.myhuaweicloud.com/source.mp4?signature=secret',sourceEvidence:{originalText:'Recovered original script'}}}
const result=await resolveBrainstormVideos(before,'brand',read)
assert.deepEqual(result.items.map(i=>i.savedCreativeId),['restored','duplicate'])
assert(result.videoResolutionIncomplete)
assert(result.items.every(i=>i.videoStatus==='available'&&i.originalScript==='Recovered original script'&&i.videoUrl.startsWith('/api/brands/brand/content-creatives/')))
assert(!JSON.stringify(result).includes('secret'))
assert.equal(calls.filter(id=>id==='cre_good').length,1)
assert(!calls.includes('saved_fake'));assert(!calls.includes('cre_other'))
assert.deepEqual(before,snapshot)
const complete=await resolveBrainstormVideos(before.filter(c=>c.idea.savedCreativeId!=='offline'),'brand',read)
assert.equal(complete.videoResolutionIncomplete,false)
const fresh=await resolveBrainstormVideos([{idea:{sourceId:'cre_good',title:'Fresh'},current:{source:reference('cre_good')}}],'other-brand',read)
assert.equal(fresh.items[0].videoUrl,'/api/brands/other-brand/ai/brainstorm/cre_good/media')
assert.deepEqual(await resolveBrainstormVideos([],'brand',read),{items:[],videoResolutionIncomplete:false})
console.log('PASS video eligibility: unlinked/title-only hidden, legacy URL recovered, request deduplication, pins/conflicts, missing media, transient failure, no mutation, brand-scoped proxy')
