import {NextResponse} from 'next/server'
import {getSession} from '@/lib/auth'
import {canSessionAccessBrandProject} from '@/lib/brandAccess'
import {prepareAssetThumbnails} from '@/lib/assetThumbnails'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getSession();if(!session?.user)return NextResponse.json({error:'Unauthorized'},{status:401})
 const {id}=await params,user=session.user
 if(!await canSessionAccessBrandProject(id,user.id,user.type??'HUMAN',user.role))return NextResponse.json({error:'Not found'},{status:404})
 let body;try{body=await request.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 try{return NextResponse.json(await prepareAssetThumbnails(id,body?.assetIds,body?.retry??false))}
 catch(e){const status=(e as {status?:number}).status;return NextResponse.json({error:'Could not prepare previews'},{status:status&&status>=400&&status<500?status:503})}
}
