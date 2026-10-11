import { nativeError, TASK_ALLOWANCE } from './contract'

export const MODEL_INVOCATION_ALLOWANCE = 150000
export function assertTaskAllowance(usage:{platformUnits:unknown;complete?:boolean}){
  const used=Number(usage.platformUnits)
  if(usage.complete===false||!Number.isFinite(used)||used<0)throw nativeError('usage_reconciliation_required',409)
  if(used+MODEL_INVOCATION_ALLOWANCE>TASK_ALLOWANCE)throw Object.assign(nativeError('task_allowance_exhausted',429),{limitReached:true})
}

// Preserve provider error identity and usage so every failed invocation is settled.
export function boundInvalidActions<T extends {next:(request:any)=>Promise<any>;name?:string;checkReady?:()=>Promise<unknown>}>(provider:T){
  const failures=new Map<string,number>()
  return {name:provider.name,...(provider.checkReady?{checkReady:()=>provider.checkReady!()}:{}),next:async(request:any)=>{
    const taskId=request.billingContext?.taskId
    try{const action=await provider.next(request);if(taskId)failures.delete(taskId);return action}
    catch(error){
      if(error&&typeof error==='object'&&'invalidAction' in error&&error.invalidAction===true){
        const count=taskId?(failures.get(taskId)||0)+1:3
        if(count>=3){if(taskId)failures.delete(taskId);error.invalidAction=false}
        else{if(failures.size>=256)failures.delete(failures.keys().next().value!);failures.set(taskId,count)}
      }else if(taskId)failures.delete(taskId)
      throw error
    }
  }}
}
