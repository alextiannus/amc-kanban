import {nativeHttp} from '@/lib/ai-native/http'
import {merchantWorkspace} from '@/lib/merchant-workspace'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,q=new URL(request.url).searchParams
 return nativeHttp(request,user=>merchantWorkspace(user,id,{action:q.has('id')?'read':'list',id:q.get('id'),shared:q.get('shared')==='true',after:q.get('after')||'',revision:q.has('revision')?Number(q.get('revision')):undefined}))
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params
 return nativeHttp(request,(user,body)=>merchantWorkspace(user,id,body),220000)
}
