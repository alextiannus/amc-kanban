import assert from 'node:assert/strict'
import {filterModels,groupIssues,modelUses} from '../src/components/admin/modelManagementView.ts'
const connections=[{id:'a',name:'Kopix'},{id:'b',name:'Gateway'}]
const models=Array.from({length:26},(_,i)=>({id:String(i),connectionId:i%2?'a':'b',definition:{name:`Model ${String(i).padStart(2,'0')}`,modelName:`model-${i}`,isEnabled:i!==25,capabilities:[i%2?'text':'video_generation'],previousModelId:i===24?'23':undefined}}))
const current={defaults:{text:'3'},exceptions:{}},draft={defaults:{text:'5'},exceptions:{'content:video_generation:tiktok':'2'}}
const filters={search:'',provider:'',capability:'',status:''}
const list=filterModels(models,connections,current,draft,filters)
assert.equal(list.length,25)
assert.equal(list[0].id,'3')
assert.equal(list.at(-1)?.id,'25')
assert.equal(list.slice(0,12).length,12)
assert.equal(filterModels(models,connections,current,draft,{...filters,status:'history'})[0].id,'23')
assert.equal(filterModels(models,connections,current,draft,{...filters,status:'current'}).length,1)
assert.equal(filterModels(models,connections,current,draft,{...filters,status:'draft'}).length,2)
assert.ok(filterModels(models,connections,current,draft,{...filters,provider:'Kopix',capability:'text',search:'MODEL-5'}).some(m=>m.id==='5'))
assert.deepEqual(modelUses(draft,'2'),['Content / 视频生成 / TikTok'])
const originals=['Unresolved instagram:reference_subtitle_ocr','Unresolved tiktok:reference_subtitle_ocr','Unknown raw error','model: missing credential']
const groups=groupIssues(originals)
assert.equal(groups.length,3)
assert.deepEqual(groups.flatMap(g=>g.items).sort(),[...originals].sort())
assert.equal(groups.find(g=>g.category==='任务路由')?.items.length,2)
console.log('PASS: catalog search, filters, ordering, history, pagination and lossless issue grouping')
