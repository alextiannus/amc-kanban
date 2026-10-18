import type {Pool} from 'pg'
import {prisma} from '../prisma'
import {admitBrandIdeas} from './idea-selection'

// Daily discovery stores raw sources only. Admission is separate and never adapts.
export async function advanceDailyPlanning(_pool:Pool,brandId:string){
 const principals=await prisma.crewMember.findMany({where:{active:true,role:{in:['PRINCIPAL','OWNER']},crew:{brandId,brand:{status:'ACTIVE'}},user:{type:'HUMAN',status:'ACTIVE'}},orderBy:{joinedAt:'asc'},select:{userId:true}})
 for(const principal of principals){try{return await admitBrandIdeas(principal.userId,brandId)}catch(error){if((error as any).code==='ai_access_denied')continue;throw error}}
 return {ok:true,selected:[],reason:'principal_unavailable'}
}
