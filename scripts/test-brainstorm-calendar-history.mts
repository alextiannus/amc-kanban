import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import * as visibility from '../src/lib/brand-plan/creativeVisibility.ts'
import * as contract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as markers from '../src/lib/brand-plan/creativeDraftMarker.ts'
const selected={id:'selected',title:'Selected',creativeBrowserSelection:{policy:visibility.CREATIVE_SELECTION_POLICY,reason:'like'}}
const history={id:'history',title:'Historical script',planning:'Keep saved script',date:'2026-10-01',calendarSelection:{draftId:'untouched-placeholder'}}
const empty={id:'empty',title:'Title only'}
const items=[selected,history,empty,{id:'disliked',title:'Hidden',brandDismissal:{decision:'dislike'}},{id:'archived',status:'archived'}]
const knowledge={marketingSolution:{publishingCalendar:{months:{'2026-10':items}}}},snapshot=structuredClone(knowledge)
let writes=0
const db:any={brandKnowledge:{findUnique:async()=>knowledge,update:async()=>{writes++}},$queryRaw:async()=>[],contentDraft:{findMany:async()=>[],create:async()=>{writes++}}}
const deps:any={'./calendarProjection':{calendarMonthProjectionSql:''},'./creativeVisibility.ts':visibility,'@/lib/prisma':{prisma:db},'./creativeRevisionContract.ts':contract,'./creativeDraftMarker.ts':markers,'./creativeWorkspaceContract.ts':{normalizeCreativeWorkspaceItem:(raw:any)=>({id:raw.id})}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/brand-plan/calendarSync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>{assert(name in deps,name);return deps[name]},mod,mod.exports)
assert.equal(mod.exports.calendarCreativeOption(empty),null)
const standard=await mod.exports.listOpenCalendarCreativeOptions('brand','2026-10',db)
assert.deepEqual(standard.map((i:any)=>i.id),['selected'])
const withHistory=await mod.exports.listOpenCalendarCreativeOptions('brand','2026-10',db,{includeHistory:true})
assert.deepEqual(withHistory.map((i:any)=>i.id).sort(),['empty','history','selected'])
assert(withHistory.filter((i:any)=>i.id!=='selected').every((i:any)=>i.historical===true))
assert.equal(withHistory.find((i:any)=>i.id==='history').planning,'Keep saved script')
assert.equal(withHistory.find((i:any)=>i.id==='selected').historical,undefined)
assert.equal(writes,0);assert.deepEqual(knowledge,snapshot)
console.log('PASS historical calendar: explicit opt-in, separate history flag, title-only/script retention, hidden dismissed/archived records, no enrollment or draft creation')
