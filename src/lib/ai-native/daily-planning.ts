import type {Pool} from 'pg'

// Discovery runs independently; every score now requires an explicit human Like.
export async function advanceDailyPlanning(_pool:Pool,_brandId:string){
 return {ok:true,selected:[],reason:'human_choice_required'}
}
