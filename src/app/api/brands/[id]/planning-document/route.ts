import {allowedRoleWriteOrigin} from '@/lib/role-permissions/request-origin'
import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionWriteBrandProject} from '@/lib/brandAccess'
import {savePlanningDocument} from '@/lib/ai-native/planning-document'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!allowedRoleWriteOrigin(request)||request.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'Forbidden'},{status:403})
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionWriteBrandProject(id,auth.user.id,auth.user.type))return NextResponse.json({error:'Not found'},{status:404})
 try{return NextResponse.json(await savePlanningDocument(id,auth.user.id,await request.json()))}catch(e){return NextResponse.json({error:(e as Error).message},{status:(e as any).statusCode||500})}
}
