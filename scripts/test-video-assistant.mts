import assert from 'node:assert/strict'
import {createVideoAssistant, projectRevision} from '../src/lib/video-assistant/core.ts'
const rows=new Map<string,any>();let counter=0,calls:any[]=[],denied=false,lose=false
const draft:any={id:'p1',brandId:'b1',createdBy:'u1',title:'新品',status:'draft',libraryState:'draft',objective:'新品短片',referenceAssetIds:['a1'],audioSettings:{nativeAudioEnabled:true},shots:[{shotId:'s1',prompt:'菜品特写',durationSec:15}],input:{productionOptions:{voiceMode:'model',subtitlesEnabled:true}}}
const deps:any={now:()=>Date.parse('2026-11-09T00:00:00Z'),origin:'https://amc.example',authorize:async()=>{if(denied)throw Error('denied')},
 reserve:async(key:string,fingerprint:string,value:any)=>{const old=[...rows.values()].find(r=>r.key===key);if(old){assert.equal(old.fingerprint,fingerprint);return {...old,created:false}}const row={id:'r'+(++counter),key,fingerprint,value};rows.set(row.id,row);return {...row,created:true}},
 lookup:async(key:string)=>[...rows.values()].find(r=>r.key===key),get:async(id:string)=>rows.get(id),save:async(id:string,value:any)=>{rows.get(id).value=value},
 content:async(_actor:any,method:string,path:string,body:any)=>{calls.push({method,path,body});if(path.endsWith('/estimate'))return {confirmation:{id:'cost1',estimatedAmount:1.2,currency:'USD',expiresAt:'2026-11-09T00:15:00Z'},breakdown:{pricingConfigured:true},amcCredit:{amount:300,unit:'AMC Credit',chargePolicy:'reserve_settle_release'}};if(path.endsWith('/generate')){if(lose)throw Error('lost');draft.status='processing';return structuredClone(draft)}if(path.endsWith('/confirm')){draft.libraryState='completed';return {ok:true,assetId:'final1'}}if(path.includes('/download'))return {url:'https://media.example/final.mp4'};return structuredClone(draft)}}
const service=createVideoAssistant(deps),actor={userId:'u1'},scope={brandId:'b1',projectId:'p1'}
const created=await service.call(actor,'video_create_draft',{brandId:'b1',requestKey:'create-001',prompt:'新品短片',assetIds:['a1'],language:'zh',platform:'tiktok',durationSec:15,aspectRatio:'9:16'})
assert.equal(created.projectId,'p1')
const n=calls.length;await service.call(actor,'video_create_draft',{brandId:'b1',requestKey:'create-001',prompt:'新品短片',assetIds:['a1'],language:'zh',platform:'tiktok',durationSec:15,aspectRatio:'9:16'});assert.equal(calls.length,n)
const approval=await service.call(actor,'video_request_generation',{...scope,requestKey:'render-001',expectedRevision:projectRevision(draft)})
assert.equal(approval.state,'awaiting_input');assert.equal(calls.filter(c=>c.path.endsWith('/generate')).length,0)
const id=approval.approvalId
await assert.rejects(()=>service.confirm({userId:'other'},id),/not_found/)
draft.shots[0].prompt='人工已修改';await assert.rejects(()=>service.confirm(actor,id),/revision_conflict/)
draft.shots[0].prompt='菜品特写'
const approval2=await service.call(actor,'video_request_generation',{...scope,requestKey:'render-002',expectedRevision:projectRevision(draft)})
await Promise.all([service.confirm(actor,approval2.approvalId),service.confirm(actor,approval2.approvalId)])
assert.equal(calls.filter(c=>c.path.endsWith('/generate')).length,1)
assert.equal((await service.call(actor,'video_get_project',scope)).status,'processing')
const approval3=await service.call(actor,'video_request_generation',{...scope,requestKey:'render-003',expectedRevision:projectRevision(draft)})
lose=true;const unknown=await service.confirm(actor,approval3.approvalId);assert.equal(unknown.state,'reconciliation_required');const before=calls.length;await service.confirm(actor,approval3.approvalId);assert.equal(calls.length,before+1,'only re-read project, never resubmit uncertain generation')
await assert.rejects(()=>service.call(actor,'video_get_output',scope),/review_required/)
draft.status='complete';draft.assemblyJob={id:'assembly1',status:'completed',outputs:[{id:'media1',mimeType:'video/mp4',url:'https://media.example/preview.mp4'}]}
const review=await service.call(actor,'video_request_review',{...scope,requestKey:'review-001',expectedRevision:projectRevision(draft)})
await service.confirm(actor,review.approvalId)
assert.equal((await service.call(actor,'video_get_output',scope)).outputs[0].download.url,'https://amc.example/api/video-assistant/output?brandId=b1&projectId=p1&mediaId=media1')
denied=true;await assert.rejects(()=>service.call(actor,'video_get_project',scope),/denied/)
console.log('PASS shared video closure: durable replay, human confirmation, changed revision, owner isolation, concurrent submit, uncertain result, real progress, final review/download, revocation')
