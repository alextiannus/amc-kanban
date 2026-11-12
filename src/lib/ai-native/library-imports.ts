import {digest} from './contract'
import {storedBrainstormSource} from './brainstorm-storage'
export const LIBRARY_IMPORT='CREATIVE_LIBRARY_IMPORT'
export const libraryImportId=(brandId:string,sourceId:string)=>'library_'+digest([brandId,sourceId]).slice(0,48)
export async function importedSources(db:any,brandId:string){
  const rows=await db.brandMarketingSolution.findMany({where:{brandId,kind:LIBRARY_IMPORT,status:'SAVED'},orderBy:[{createdAt:'desc'},{id:'desc'}]})
  return rows.map((row:any)=>({...row.output?.source,sourceType:'manual-library',importedAt:row.createdAt?.toISOString?.()||row.createdAt}))
}
export async function importedSource(db:any,brandId:string,sourceId:string){
  const row=await db.brandMarketingSolution.findUnique({where:{id:libraryImportId(brandId,sourceId)}})
  if(!row||row.brandId!==brandId||row.kind!==LIBRARY_IMPORT||row.status!=='SAVED'||row.period!==sourceId)return null
  const source=await storedBrainstormSource(db,brandId,row.output?.source)
  // Evidence may already be shared with a recommendation. Import provenance belongs
  // to the brand import record, never to that deduplicated evidence snapshot.
  return source?{...source,sourceType:'manual-library',matchingPolicy:'manual-library-v1',matchScore:null}:null
}
