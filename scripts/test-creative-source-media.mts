import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Readable} from 'node:stream'
import {EventEmitter} from 'node:events'
import ts from 'typescript'
import {CreativeRevisionError} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as mediaPolicy from '../src/lib/brand-plan/creativeSourceMediaPolicy.ts'
function load(path:string,deps:Record<string,unknown>){const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports);return mod.exports}
let url='https://media.example/video.mp4?X-Amz-Signature=hidden',hostIp='93.184.216.34',status=200,type='video/mp4',length:string|undefined,bytes=4,contentRange='',requestedRange:string|null=null,calls=0,auth:any=null
const open=load('src/lib/brand-plan/creativeSourceMedia.ts',{
 './creativeSourceMediaPolicy':mediaPolicy,
 './creativeSource':{resolveCreativeSource:async(actor:any,brand:string)=>{if(actor.id!=='trusted'||brand!=='brand')throw new CreativeRevisionError('creative_access_denied',404);return{raw:{originalVideoUrl:url}}}},
 './creativeRevisionContract':{CreativeRevisionError},
 'node:dns/promises':{lookup:async()=>[{address:hostIp,family:4}]},
 'node:net':{isIP:(value:string)=>/^\d+(?:\.\d+){3}$/.test(value)?4:0},
 'node:stream':{Readable},
 'node:https':{request:(_url:any,options:any,callback:any)=>{
   calls++;assert.equal(options.headers.range,requestedRange||undefined);assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.cookie,undefined)
   const req:any=new EventEmitter();req.destroy=()=>{};req.setTimeout=()=>req
   req.end=()=>queueMicrotask(()=>{
     options.lookup('media.example',{},(error:any,address:any)=>{assert.equal(error,null);assert.equal(address,hostIp)})
     const response:any=Readable.from([Buffer.alloc(2),Buffer.alloc(bytes-2)])
     response.statusCode=status;response.headers={'content-type':type,...(contentRange?{'content-range':contentRange,'accept-ranges':'bytes'}:{}),...(length?{'content-length':length}:{})}
     callback(response)
   });return req
 }},
})
const route=load('src/app/api/brands/[id]/content-creatives/[creativeId]/source/media/route.ts',{
 '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth},
 '@/lib/brand-plan/creativeSourceMedia':open,
 '@/lib/brand-plan/creativeRevisionContract':{CreativeRevisionError},
})
const previousHosts=process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS,previousLimit=process.env.AMC_SOURCE_MEDIA_MAX_BYTES
try {
 process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS='media.example';process.env.AMC_SOURCE_MEDIA_MAX_BYTES='4'
 const get=(brand='brand')=>route.GET(new Request('https://app.example/media?month=2026-11',{headers:requestedRange?{range:requestedRange}:{}}),{params:Promise.resolve({id:brand,creativeId:'idea'})})
 assert.equal((await get()).status,401);assert.equal(calls,0)
 auth={user:{id:'trusted',type:'HUMAN'}}
 assert.equal((await get('other')).status,404);assert.equal(calls,0)
 const response=await get();assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,4)
 assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null)
 requestedRange='bytes=0-3';contentRange='bytes 0-3/10';status=206;length='4'
 const partial=await get();assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),contentRange);assert.equal((await partial.arrayBuffer()).byteLength,4)
 contentRange='bytes 0-4/10';assert.equal((await get()).status,502)
 status=416;contentRange='bytes */10';assert.equal((await get()).status,416)
 requestedRange='bytes=0-1,3-4';const rangeCalls=calls;assert.equal((await get()).status,416);assert.equal(calls,rangeCalls)
 requestedRange=null;contentRange='';status=200;length=undefined
 length='5';assert.equal((await get()).status,413);length=undefined
 bytes=5;const overflow=await get();await assert.rejects(overflow.arrayBuffer());bytes=4
 status=302;assert.equal((await get()).status,502);status=200
 type='text/html';assert.equal((await get()).status,502);type='video/mp4'
 for(const unsafe of ['http://media.example/a','https://other.example/a','https://media.example/admin/a','https://media.example/internal/a','https://media.example/a#secret','https://127.0.0.1/a']){url=unsafe;assert.equal((await get()).status,502)}
 url='https://media.example/video.mp4?X-Amz-Signature=hidden';hostIp='127.0.0.1';const before=calls;assert.equal((await get()).status,502);assert.equal(calls,before)
 console.log('PASS: media proxy brand auth, exact hosts, pinned public DNS, hidden signatures, redirect/type rejection and declared/chunked byte limits')
} finally {if(previousHosts===undefined)delete process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS;else process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS=previousHosts;if(previousLimit===undefined)delete process.env.AMC_SOURCE_MEDIA_MAX_BYTES;else process.env.AMC_SOURCE_MEDIA_MAX_BYTES=previousLimit}
