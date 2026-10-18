import {CREATIVE_REVISION_KIND,CreativeRevisionError,creativeWorkspace,record,revisionPeriod,validateCreativeId} from './creativeRevisionContract.ts'

// Called only after the revision reader has authorized this brand.
export async function resolveCreativeMonth(db:any,brandId:string,creativeId:string,knowledge:any):Promise<string>{
 validateCreativeId(creativeId)
 const matches=Object.entries(record(creativeWorkspace(knowledge).publishingCalendar?.months))
  .flatMap(([month,items])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&Array.isArray(items)?items.filter(item=>item?.id===creativeId).map(()=>month):[])
 if(matches.length>1)throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
 if(matches.length===1)return matches[0]
 // Retain explicit historical reads when a current workspace item is gone.
 const history=await db.brandMarketingSolution.findMany({where:{brandId,kind:CREATIVE_REVISION_KIND,input:{path:['creativeId'],equals:creativeId}},select:{input:true,period:true},distinct:['period'],take:2})
 if(history.length!==1)throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
 const month=record(history[0].input).month
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||history[0].period!==revisionPeriod(month,creativeId))throw new CreativeRevisionError('creative_not_found_or_ambiguous',404)
 return month
}
