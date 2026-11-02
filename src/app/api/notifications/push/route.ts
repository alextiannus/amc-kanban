import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {pushSettings,updatePush} from '@/lib/notification/push'
export const dynamic='force-dynamic'
export async function GET(request:Request){
 const auth=await resolveSessionOrApiKey(request);if(!auth?.user)return Response.json({error:'Unauthorized'},{status:401})
 return Response.json(await pushSettings(auth.user.id),{headers:{'Cache-Control':'no-store'}})
}
export async function POST(request:Request){
 if(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'Forbidden'},{status:403})
 const auth=await resolveSessionOrApiKey(request);if(!auth?.user)return Response.json({error:'Unauthorized'},{status:401})
 try{const text=await request.text();if(text.length>6000)return Response.json({error:'Request too large'},{status:413});return Response.json(await updatePush(auth.user.id,JSON.parse(text)))}catch{return Response.json({error:'Unable to update notification settings'},{status:400})}
}
