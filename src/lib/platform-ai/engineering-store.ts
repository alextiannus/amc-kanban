import type {Pool} from 'pg'
import {decryptSecret} from '../model-management/secrets'
import {hash} from './engineering-policy'
export type EngineeringConfig={enabled:boolean;githubToken:string}
export async function engineeringConfig(pool:Pool):Promise<EngineeringConfig|null>{
  const row=(await pool.query("SELECT encrypted_config FROM public.amc_platform_settings WHERE id='engineering-v1'")).rows[0]
  return row?JSON.parse(decryptSecret(row.encrypted_config)):null
}
export async function operation(pool:Pool,reportId:string,action:string,input:unknown,perform:(id:string,recover:boolean)=>Promise<unknown>){
  const id=hash([reportId,action,input])
  const inserted=await pool.query('INSERT INTO public.amc_platform_operations(id,report_id,action,input) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[id,reportId,action,JSON.stringify(input)])
  const row=(await pool.query('SELECT result FROM public.amc_platform_operations WHERE id=$1',[id])).rows[0]
  if(row.result)return {operationId:id,...row.result}
  const result=await perform(id,!inserted.rowCount)
  await pool.query('UPDATE public.amc_platform_operations SET result=$2 WHERE id=$1 AND result IS NULL',[id,JSON.stringify(result)])
  return {operationId:id,...result as object}
}
export async function evidence(pool:Pool,reportId:string,id:string,action?:string){
  const row=(await pool.query('SELECT * FROM public.amc_platform_operations WHERE id=$1 AND report_id=$2',[id,reportId])).rows[0]
  if(!row?.result||(action&&row.action!==action))throw Error('verified_operation_required')
  return row
}
