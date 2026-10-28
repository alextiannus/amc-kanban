import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const mod={exports:{} as any},calls:any[]=[]
const fetch=async(_url:any,options:any)=>{const body=JSON.parse(options.body);calls.push(body);assert(body.creativeIds.every((id:string)=>/^cre_/.test(id)));return Response.json({items:body.creativeIds.map((creativeId:string)=>({creativeId,source:{creativeId}})),brandTags:body.brandTagContext?{policy:'material-brand-tags-v2',tags:[]}:null})}
new Function('require','module','exports','fetch',ts.transpileModule(readFileSync('src/lib/promotion-strategy/clients.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),mod,mod.exports,fetch)
const ids=Array.from({length:73},(_,i)=>`cre_${i}`)
const result=await mod.exports.fetchBrainstormBrowse([...ids,'legacy_missing','cre_0',undefined],{name:'brand'})
assert.equal(calls.length,2);assert.equal(calls[0].creativeIds.length,72);assert.equal(calls[1].creativeIds.length,1);assert.equal(result.items.length,73);assert(!calls[1].brandTagContext)
console.log('PASS bounded batch reads, deduplication, invalid legacy identities isolated, brand tags read once')
