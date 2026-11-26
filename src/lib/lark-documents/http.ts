import type {AuthPrincipal} from '../auth-v2/types'
import {isLarkError,LarkError,LARK_SCOPES} from './provider'
import type {LarkService} from './service'

const MM_ORIGIN='https://amc-mm.immedi.ai'
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
export function larkOrigin(request:Request){
  const origin=request.headers.get('origin')
  const allowed=new Set([MM_ORIGIN])
  if(process.env.NODE_ENV!=='production'){
    allowed.add(new URL(request.url).origin)
    allowed.add('http://localhost:3001')
    allowed.add('http://127.0.0.1:3001')
  }
  if(!origin||!allowed.has(origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new LarkError('FORBIDDEN_ORIGIN',403)
  return origin
}
export async function larkHttp(request:Request,principal:AuthPrincipal|null,service:LarkService,callback=false){
  try{
    if(!principal)throw new LarkError('AUTH_REQUIRED',401)
    if(principal.source!=='session')throw new LarkError('SIGN_IN_TO_CONNECT_LARK',403)
    const actor={userId:principal.userId,authVersion:principal.authVersion}
    if(request.method==='GET'&&!callback){
      const brandId=new URL(request.url).searchParams.get('brandId')
      if(!brandId||!/^[-a-zA-Z0-9_]{1,128}$/.test(brandId))throw new LarkError('BRAND_REQUIRED',422)
      return json({...await service.status(actor,brandId),callbackUrl:MM_ORIGIN+'/lark/callback',requiredScopes:LARK_SCOPES})
    }
    const origin=larkOrigin(request)
    if(!['POST','DELETE'].includes(request.method))throw new LarkError('METHOD_NOT_ALLOWED',405)
    if(!(request.headers.get('content-type')||'').startsWith('application/json'))throw new LarkError('JSON_REQUIRED',415)
    const raw=await request.text();if(raw.length>4096)throw new LarkError('REQUEST_TOO_LARGE',413)
    let body:any;try{body=JSON.parse(raw)}catch{throw new LarkError('INVALID_JSON',400)}
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.brandId!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(body.brandId))throw new LarkError('BRAND_REQUIRED',422)
    if(callback){
      if(request.method!=='POST'||typeof body.state!=='string'||!/^[-a-zA-Z0-9_]{40,100}$/.test(body.state)||typeof body.code!=='string'||body.code.length<1||body.code.length>2048)throw new LarkError('INVALID_OAUTH_CALLBACK',422)
      return json(await service.callback(actor,body.brandId,body.state,body.code,origin))
    }
    if(request.method==='DELETE')return json(await service.disconnect(actor,body.brandId))
    return json(await service.start(actor,body.brandId,origin))
  }catch(error){return json({error:isLarkError(error)?error.code:'LARK_SERVICE_UNAVAILABLE'},isLarkError(error)?error.status:503)}
}
