import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Compile the actual route against declarations derived from the actual service
// parameter types. This intentionally does not use transpileModule.
const route = 'src/app/api/brands/[id]/content-creatives/[creativeId]/schedule/route.ts'
const service = readFileSync('src/lib/brand-plan/creativeScheduling.ts', 'utf8')
const aliases = ['Actor', 'ScheduleInput', 'RequestInput'].map(name => service.match(new RegExp(`type ${name} = [^\\n]+`))?.[0])
assert(aliases.every(Boolean))
const signatures = ['scheduleCreative', 'unscheduleCreative'].map(name => {
  const signature = service.match(new RegExp(`export function ${name}\\(([^\\n]+), db = prisma, now = new Date\\(\\)\\)`))?.[1]
  assert(signature)
  return `export function ${name}(${signature}): Promise<unknown>;`
})
const accountSignature=service.match(/export async function readCreativeScheduleAccounts\(([^\n]+),db=prisma\)/)?.[1]
assert(accountSignature)
signatures.push(`export function readCreativeScheduleAccounts(${accountSignature}): Promise<unknown>;`)
const files: Record<string,string> = {
  '/route.ts': readFileSync(route, 'utf8'),
  '/deps.d.ts': `declare module '@/lib/user-management/auth' { export function resolveSessionOrApiKey(r: Request): Promise<{user:{id:string;type:string}} | null>; }
declare module '@/lib/role-permissions/request-origin' { export function allowedRoleWriteOrigin(r:Request): boolean; }
declare module '@/lib/brand-plan/creativeRevisionContract' { export class CreativeRevisionError extends Error { code:string; status:number; } }
declare module '@/lib/brand-plan/creativeScheduling' { ${aliases.join('\n')}\n${signatures.join('\n')} }`,
}
const options: ts.CompilerOptions = { strict:true, noEmit:true, target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext, skipLibCheck:true, types:[] }
const host = ts.createCompilerHost(options)
const read = host.readFile.bind(host), exists = host.fileExists.bind(host)
host.readFile = path => files[path] ?? read(path)
host.fileExists = path => Object.hasOwn(files,path) || exists(path)
host.getSourceFile = (path,languageVersion) => {
  const text=host.readFile(path)
  return text === undefined ? undefined : ts.createSourceFile(path,text,languageVersion)
}
const program = ts.createProgram(Object.keys(files),options,host)
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:p=>p,getNewLine:()=> '\n'}))
console.log('PASS: schedule route semantic typecheck against actual service parameter contracts')
