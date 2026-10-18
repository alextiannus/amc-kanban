export const DEFAULT_TEXT_TIMEOUT_MS=110000
export const PLANNING_TEXT_TIMEOUT_MS=230000
/** A trusted full-document call may select a longer deadline; normal calls retain the connection ceiling. */
export function textTimeoutMs(connectionMs:number|null|undefined,input:{task?:string;timeoutMs?:number}){
 if(input.task==='brand_planning')return Math.max(1,Math.min(PLANNING_TEXT_TIMEOUT_MS,input.timeoutMs||connectionMs||PLANNING_TEXT_TIMEOUT_MS))
 return Math.max(1,Math.min(DEFAULT_TEXT_TIMEOUT_MS,connectionMs||DEFAULT_TEXT_TIMEOUT_MS,input.timeoutMs||DEFAULT_TEXT_TIMEOUT_MS))
}
