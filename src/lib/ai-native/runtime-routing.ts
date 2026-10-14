import {nativeError} from './contract'
export type LaneCursors={default:string|null|undefined;conversation:string|null|undefined}
export function laneCursors(cursor?:string):LaneCursors{
 if(!cursor)return {default:undefined,conversation:undefined}
 if(!cursor.startsWith('lanes.'))return {default:cursor,conversation:null}
 try{
  if(cursor.length>12000)throw Error()
  const value=JSON.parse(Buffer.from(cursor.slice(6),'base64url').toString('utf8'))
  if(!value||Object.keys(value).sort().join(',')!=='conversation,default'||Object.values(value).some(v=>v!==null&&(typeof v!=='string'||!v||v.length>5000)))throw Error()
  return value
 }catch{throw nativeError('invalid_task_cursor')}
}
export function nextLaneCursor(value:{default:string|null;conversation:string|null}){
 return value.default||value.conversation?'lanes.'+Buffer.from(JSON.stringify(value)).toString('base64url'):null
}
