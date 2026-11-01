import {authenticateRequest} from '@/lib/auth-v2'
import {prisma} from '@/lib/prisma'
import {profileAiTokens} from '@/lib/profile-ai-tokens'
export const dynamic='force-dynamic'
async function handle(request:Request){
 try{return await profileAiTokens(request,await authenticateRequest(request),prisma)}
 catch{return Response.json({error:'Unable to confirm the operation. Reload your token list before trying again.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
export const GET=handle
export const POST=handle
export const DELETE=handle
