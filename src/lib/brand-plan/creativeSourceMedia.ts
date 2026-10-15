import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import { resolveCreativeSource } from './creativeSource'
import { CreativeRevisionError } from './creativeRevisionContract'
import { sourceMediaAllowedHosts, sourceMediaLocation } from './creativeSourceMediaPolicy'

const denied = () => new CreativeRevisionError('creative_source_media_unavailable',502)
function publicIpv4(address:string) {
  if (isIP(address)!==4) return false
  const [a,b]=address.split('.').map(Number)
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===198&&(b===18||b===19))
}

export async function readCreativeSourceMedia(actor:{id:string;type:string},brandId:string,month:string,creativeId:string,signal?:AbortSignal) {
  const {raw}=await resolveCreativeSource(actor,brandId,month,creativeId)
  const url=sourceMediaLocation(raw.originalVideoUrl)
  if(!url||!sourceMediaAllowedHosts().has(url.hostname.toLowerCase()))throw denied()
  // Resolve only public A records and pin the actual connection to that result;
  // validating a hostname then re-resolving during fetch permits DNS rebinding.
  let addresses:Array<{address:string;family:number}>
  let lookupTimeout:ReturnType<typeof setTimeout>|undefined
  try {addresses=await Promise.race([
    lookup(url.hostname,{all:true,family:4}),
    new Promise<never>((_resolve,reject)=>{lookupTimeout=setTimeout(()=>reject(denied()),5000)}),
  ])} catch {throw denied()} finally {clearTimeout(lookupTimeout)}
  if(!addresses.length||addresses.some(row=>!publicIpv4(row.address)))throw denied()
  const address=addresses[0].address
  const configured=Number(process.env.AMC_SOURCE_MEDIA_MAX_BYTES)
  const limit=Number.isSafeInteger(configured)&&configured>0&&configured<=512*1024*1024?configured:64*1024*1024
  const abort=signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)
  return new Promise<Response>((resolve,reject)=>{
    const req=httpsRequest(url,{
      method:'GET',agent:false,signal:abort,
      headers:{accept:'video/mp4, video/webm, video/quicktime','accept-encoding':'identity'},
      lookup:(_hostname,options,callback:any)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4),
    },upstream=>{
      const type=String(upstream.headers['content-type']||'').split(';')[0].trim().toLowerCase()
      const declared=upstream.headers['content-length']
      const length=declared===undefined?null:Number(declared)
      const error=length!==null&&length>limit?new CreativeRevisionError('creative_source_media_too_large',413)
        :upstream.statusCode!==200||!['video/mp4','video/webm','video/quicktime'].includes(type)||(upstream.headers['content-encoding']&&upstream.headers['content-encoding']!=='identity')||length!==null&&(!Number.isSafeInteger(length)||length<0)?denied():null
      if(error){upstream.destroy();reject(error);return}
      const reader=(Readable.toWeb(upstream) as ReadableStream<Uint8Array>).getReader()
      let size=0
      const body=new ReadableStream<Uint8Array>({
        async pull(controller){
          try {
            const {done,value}=await reader.read()
            if(done){controller.close();return}
            size+=value.byteLength
            if(size>limit){await reader.cancel();controller.error(new Error('creative_source_media_too_large'));return}
            controller.enqueue(value)
          } catch {controller.error(new Error('creative_source_media_unavailable'))}
        },
        cancel(reason){return reader.cancel(reason)},
      })
      resolve(new Response(body,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',...(length===null?{}:{'Content-Length':String(length)})}}))
    })
    req.on('error',()=>reject(denied()))
    req.setTimeout(30000,()=>req.destroy())
    req.end()
  })
}
