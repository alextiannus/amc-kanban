import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'

// Check actual networking implementation against installed Node/Web typings,
// isolating unrelated database/Next application imports rather than transpiling.
const source=readFileSync('src/lib/brand-plan/creativeSourceMedia.ts','utf8')
  .replace("'./creativeSource'","'task4/source'")
  .replace("'./creativeRevisionContract'","'task4/contract'")
  .replace("'./creativeSourceMediaPolicy'","'task4/policy'")
const files:Record<string,string>={
 [resolve('scripts/task4-media-check.ts')]:source,
 [resolve('scripts/task4-media-check.d.ts')]:`declare module 'task4/source' {export function resolveCreativeSource(actor:{id:string;type:string},brandId:string,month:string,creativeId:string):Promise<{raw:any}>;}
declare module 'task4/contract' {export class CreativeRevisionError extends Error {constructor(code:string,status?:number);code:string;status:number;}}
declare module 'task4/policy' {export function sourceMediaAllowedHosts():Set<string>;export function sourceMediaLocation(value:unknown):URL|null;}`,
}
const options:ts.CompilerOptions={strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,skipLibCheck:true,types:['node']}
const host=ts.createCompilerHost(options),read=host.readFile.bind(host),exists=host.fileExists.bind(host)
host.readFile=path=>files[path]??read(path)
host.fileExists=path=>Object.hasOwn(files,path)||exists(path)
host.getSourceFile=(path,version)=>{const text=host.readFile(path);return text===undefined?undefined:ts.createSourceFile(path,text,version)}
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(Object.keys(files),options,host))
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:p=>p,getNewLine:()=> '\n'}))
console.log('PASS: source media networking semantic typecheck against real Node and Web APIs')
