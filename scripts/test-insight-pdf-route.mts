import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
class NextResponse extends Response{static json(body:unknown,init?:ResponseInit){return new NextResponse(JSON.stringify(body),{...init,headers:{'Content-Type':'application/json'}})}}
let authenticated=true,allowed=true,readFailure=false,pdfFailure=false,pdfBody='%PDF-1.7\nEXACT BYTES'
let report:any={id:'42',pdfPath:'/public/downloads/brand-intelligence-intake/version42.pdf'}
const code=ts.transpileModule(readFileSync('src/app/api/brands/[id]/insight/pdf/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{} as any}
new Function('require','module','exports',code)((name:string)=>{
 if(name==='next/server')return {NextResponse}
 if(name.includes('user-management/auth'))return {resolveSessionOrApiKey:async()=>authenticated?{user:{id:'owner',type:'HUMAN',role:'OWNER'}}:null}
 if(name.includes('brandAccess'))return {canSessionAccessBrandProject:async()=>allowed}
 if(name.includes('insight-service'))return {readAvailableInsight:async()=>{if(readFailure)throw Error();return {report}}}
 if(name.includes('growthDataCenter'))return {readGrowthReportArtifact:async(path:string)=>{assert.equal(path,report.pdfPath);if(pdfFailure)throw Error();return {body:new TextEncoder().encode(pdfBody).buffer}}}
 throw Error('Unexpected import '+name)
},module,module.exports)
const get=(q='version=42')=>module.exports.GET(new Request('https://amc.test/api/brands/one/insight/pdf?'+q),{params:Promise.resolve({id:'one'})})
authenticated=false;assert.equal((await get()).status,401)
authenticated=true;allowed=false;assert.equal((await get()).status,404)
allowed=true;assert.equal((await get('version=other')).status,409)
let response=await get();assert.equal(response.status,200);assert.equal(await response.text(),pdfBody);assert(response.headers.get('Content-Disposition')?.startsWith('inline;'));assert.equal(response.headers.get('Cache-Control'),'private, no-store')
response=await get('version=42&download=1');assert(response.headers.get('Content-Disposition')?.startsWith('attachment;'))
report={id:'42'};assert.equal((await get()).status,404)
report={id:'42',pdfPath:'/public/downloads/brand-intelligence-intake/version42.pdf'};pdfFailure=true;assert.equal((await get()).status,502)
pdfFailure=false;pdfBody='HTML instead of PDF';assert.equal((await get()).status,502)
readFailure=true;assert.equal((await get()).status,502)
console.log('PASS: PDF route auth, cross-brand rejection, version mismatch, exact inline/download bytes, no-store, missing file and upstream failure distinction, invalid PDF rejection')
