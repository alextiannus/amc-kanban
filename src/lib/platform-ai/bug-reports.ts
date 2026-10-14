import {Pool} from 'pg'
import {requireActor} from '../ai-native/application'
import {actorFor,nativeError} from '../ai-native/contract'
import {initializeBugReports,saveBugReport,readBugReport} from './bug-report-store'

const state=globalThis as typeof globalThis&{amcBugReports?:Promise<Pool>}
export async function reportPool(){
  if(!state.amcBugReports)state.amcBugReports=(async()=>{
    if(!process.env.DATABASE_URL)throw nativeError('database_unavailable',503)
    // Independent of model/runtime initialization: users can report a broken Assistant.
    const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,options:'-c statement_timeout=10000'})
    try{await initializeBugReports(pool);return pool}catch(error){await pool.end();throw error}
  })().catch(error=>{state.amcBugReports=undefined;throw error})
  return state.amcBugReports
}
export async function submitBugReport(userId:string,brandId:string,body:unknown){
  await requireActor(actorFor(brandId,userId))
  return saveBugReport(await reportPool(),userId,brandId,body)
}
export async function getBugReport(userId:string,brandId:string,id:string){
  await requireActor(actorFor(brandId,userId))
  return readBugReport(await reportPool(),userId,brandId,id)
}
