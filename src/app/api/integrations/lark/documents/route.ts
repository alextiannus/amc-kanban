import {authenticateRequest} from '@/lib/auth-v2'
import {larkHttp} from '@/lib/lark-documents/http'
import {larkDocuments} from '@/lib/lark-documents/runtime'
export const dynamic='force-dynamic'
async function handle(request:Request){
  try{return await larkHttp(request,await authenticateRequest(request),larkDocuments)}
  catch{return Response.json({error:'LARK_SERVICE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
export const GET=handle
export const POST=handle
export const DELETE=handle
