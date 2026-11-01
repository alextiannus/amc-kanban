import {NextResponse} from 'next/server'
import {resolveSessionOrApiKey} from '@/lib/user-management/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {isProfileSection,readProfileDocument} from '@/lib/profile-document'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await resolveSessionOrApiKey(request)
 if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params
 if(!await canSessionAccessBrandProject(id,auth.user.id,auth.user.type,auth.user.role))return NextResponse.json({error:'Not found'},{status:404})
 const section=new URL(request.url).searchParams.get('section')
 if(!isProfileSection(section))return NextResponse.json({error:'Invalid section'},{status:400})
 const document=await readProfileDocument(id,section)
 return NextResponse.json(document||{error:'Not found'},{status:document?200:404,headers:{'Cache-Control':'no-store'}})
}
