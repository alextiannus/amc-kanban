import crypto from 'node:crypto'
import { prisma } from '../prisma'
import { erpPost, type ImmediErpConfig } from './immediErp'
import { brandInclude, resolvePrincipal } from './immediOrders'

export async function syncMonthlyRewards(cfg: ImmediErpConfig, withReceipt: (kind:string,sourceId:string,execute:(tx:any,row:any)=>Promise<any>)=>Promise<any>) {
 return withReceipt('REWARDS','monthly',async(tx,row)=>{
  // One repeatable-read database snapshot, not a truncated page or inferred dates.
  const subscriptions = await prisma.$transaction(async (db:any) => db.brandSubscription.findMany({where:{status:'ACTIVE',feeWaived:false,totalDueUsd:{gt:0}},include:{brand:{include:brandInclude}},orderBy:{id:'asc'},take:5001}),{isolationLevel:'RepeatableRead'})
  if(subscriptions.length>5000)throw new Error('订阅超过同步上限，需分页核对；不会按部分数据结算')
  const input={complete:true,subscriptions:subscriptions.map((s:any)=>{
   let employeeId:string|null=null
   try { if(s.brand)employeeId=resolvePrincipal(s.brand,cfg) } catch {}
   return {id:s.id,brand_id:s.brandId,brand_name:s.brand?.name||null,plan_id:s.planId,principal_employee_id:employeeId,status:s.status,fee_waived:s.feeWaived,amount:s.totalDueUsd,contract_start:s.contractStartDate?.toISOString()||null,contract_end:s.contractEndDate?.toISOString()||null}
  })}
  const period=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit'}).format(new Date())
  const hash=crypto.createHash('sha256').update(JSON.stringify({period,input})).digest('hex')
  if(row.payloadHash===hash&&row.payload&&Date.now()-row.updatedAt.getTime()<3600000)return row
  const response=await erpPost<Record<string,any>>({baseUrl:cfg.baseUrl,apiKey:cfg.apiKey,path:'/amc-monthly-rewards',body:input},0)
  if(response.status!==200||!response.data.result?.policyDigest)throw new Error(`ERP 月度奖励核对失败 ${response.status}: ${JSON.stringify(response.data)}`)
  const result=response.data.result
  return tx.immediErpSync.update({where:{id:row.id},data:{status:result.complete?'SYNCED':'PARTIAL',payloadHash:hash,payload:result,reference:result.policyVersion,attempts:0,lastError:null}})
 })
}
