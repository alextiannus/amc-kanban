import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
let session: any = null, writes = 0, reads = 0
const receipt = { status: 'COMPLETE', result: { skuCount: 2 } }
const deps: Record<string, any> = {
 'next/server': { after: () => undefined, NextResponse: { json: (value: unknown, init: ResponseInit = {}) => Response.json(value, init) } },
 '@/lib/auth': { getSession: async () => session },
 '@/lib/brandAccess': { canWriteBrandProject: async (brandId: string, userId: string) => brandId === 'own-brand' && userId === 'owner' },
 '@/lib/prisma': { prisma: { googleBrandImport: { findUnique: async () => { reads++; return receipt } } } },
 '@/lib/googleBrandImport': { ownedGoogleLocations: async () => { reads++; return [] }, queueGoogleBrandImport: async () => { writes++ }, runGoogleBrandImport: async () => undefined, selectGoogleLocation: async () => { writes++ } },
 '@/lib/integrations/googleBrandData': { GoogleImportError: class extends Error {} },
}
const source=fs.readFileSync(new URL('../src/app/api/brands/[id]/google-import/route.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
const m={exports:{} as any};new Function('require','module','exports',compiled)((key:string)=>{if(!(key in deps))throw new Error(key);return deps[key]},m,m.exports)
const request=(method='GET',body?:string)=>new Request('http://local/api/brands/own-brand/google-import',{method,...(body?{body,headers:{'Content-Type':'application/json'}}:{})})
const own={params:Promise.resolve({id:'own-brand'})},foreign={params:Promise.resolve({id:'other-brand'})}
assert.equal((await m.exports.GET(request(),own)).status,404)
session={user:{id:'owner',type:'HUMAN'}}
assert.equal((await m.exports.GET(request(),foreign)).status,404)
assert.equal((await m.exports.POST(request('POST','{}'),foreign)).status,404)
session={user:{id:'owner',type:'AI_AGENT'}}
assert.equal((await m.exports.POST(request('POST','{}'),own)).status,404)
assert.equal(reads+writes,0,'Unauthorized calls must not reach database or providers')
session={user:{id:'owner',type:'HUMAN'}}
const response=await m.exports.GET(request(),own)
assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store')
assert.equal((await response.json()).brandId,'own-brand')
assert.equal((await m.exports.POST(request('POST','invalid'),own)).status,400)
assert.equal((await m.exports.POST(request('POST','{}'),own)).status,202)
assert.equal(writes,1)
console.log('PASS: human write scope, brand isolation, no unauthorized provider access, no-store, malformed body, queued import')
