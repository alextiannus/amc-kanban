import assert from 'node:assert/strict'
import {filterModels,groupIssues,modelUses,selectCapabilityDefault} from '../src/components/admin/modelManagementView.ts'
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

const audioModels=[{id:'old-music',connectionId:'minimax'},{id:'speech',connectionId:'minimax'},{id:'new-music',connectionId:'stability'},{id:'other',connectionId:'other'}]
const audioConnections=[{id:'minimax',protocol:'minimax'},{id:'stability',protocol:'stability'},{id:'other',protocol:'other'}]
const audioSelection={defaults:{music:'old-music',speech_synthesis:'speech'},exceptions:{'content:music_generation:tiktok':'old-music','content:music':'old-music','content:tts_generation':'speech','content:music_generation:instagram':'other'}}
const switched=selectCapabilityDefault(audioSelection,'music','new-music',audioModels,audioConnections)
assert.equal(switched.defaults.music,'new-music')
assert.equal(switched.defaults.speech_synthesis,'speech')
assert.equal(switched.exceptions['content:music_generation:tiktok'],'new-music')
assert.equal(switched.exceptions['content:music'],'new-music')
assert.equal(switched.exceptions['content:tts_generation'],'speech')
assert.equal(switched.exceptions['content:music_generation:instagram'],'other')
assert.equal(audioSelection.exceptions['content:music_generation:tiktok'],'old-music','selection remains immutable until draft save')
console.log('PASS: Stability default switches MiniMax music overrides together and preserves speech, unrelated suppliers and the previous selection')
