import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {readNativeTaskDocument} from '@/lib/ai-native/service'
import {markdownDownload} from '@/lib/brand-plan/report-download'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string;taskId:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return Response.json({error:'Unauthorized'},{status:401})
 if(auth.user.type!=='HUMAN')return Response.json({error:'human_task_owner_required'},{status:403})
 const {id,taskId}=await params
 try{const document=await readNativeTaskDocument(auth.user.id,id,taskId);return markdownDownload(document.content,`planning-${taskId}`)}
 catch(e){const status=(e as {statusCode?:number}).statusCode;return Response.json({error:'document_unavailable'},{status:status&&[400,403,404,409].includes(status)?status:503})}
}
