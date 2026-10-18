import {admitBrandIdeas} from '@/lib/ai-native/idea-selection'
import {nativeHttp} from '@/lib/ai-native/http'
import {readIdeaPool} from '@/lib/ai-native/idea-pool'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params
  return nativeHttp(request,userId=>readIdeaPool(userId,id))
}

export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params
 return nativeHttp(request,(userId,body)=>{
  if(!body||Object.keys(body).some(key=>!['action','ideaId'].includes(key))||body.action!=='like'||typeof body.ideaId!=='string')throw Object.assign(new Error('invalid_idea_selection'),{code:'invalid_idea_selection',statusCode:400})
  return admitBrandIdeas(userId,id,body.ideaId)
 })
}
