import {nativeHttp} from '@/lib/ai-native/http'
import {requireActor} from '@/lib/ai-native/application'
import {actorFor} from '@/lib/ai-native/contract'
import {prisma} from '@/lib/prisma'
import {summarizeCreativeFeedback} from '@/lib/brand-plan/revisionFeedback'
export const dynamic='force-dynamic'
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return nativeHttp(request,async userId=>{await requireActor(actorFor(id,userId));const rows=await prisma.brandMarketingSolution.findMany({where:{brandId:id,kind:'CREATIVE_ITEM'},orderBy:{createdAt:'desc'},take:2000,select:{input:true,version:true}});return {...summarizeCreativeFeedback(rows),sampleVersions:rows.length,scope:'latest_2000_versions'}})}
