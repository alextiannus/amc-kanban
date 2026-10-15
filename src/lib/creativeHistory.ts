// Coverage is independent of rendered rows: disconnected cached pages must not
// make their older cursor hide an unread interval after a concurrent refresh.
type Revision = {id:string;revision:number}
type Range = {high:number;low:number|null}
type History<T extends Revision> = {revisions:T[];nextBeforeVersion?:number|null;historyRanges?:Range[]}

function coverage<T extends Revision>(page:History<T>,beforeVersion?:number):Range[] {
 const high=beforeVersion===undefined?page.revisions[0]?.revision:beforeVersion-1
 if(high===undefined)return []
 return [{high,low:page.nextBeforeVersion??null}]
}

export function mergeCreativeHistory<T extends Revision>(previous:History<T>|null,page:History<T>,beforeVersion?:number){
 const ranges=[...(previous?(previous.historyRanges||coverage(previous)):[]),...coverage(page,beforeVersion)].sort((a,b)=>b.high-a.high)
 const connected:Range[]=[]
 for(const range of ranges){
  const last=connected.at(-1)
  if(last&&(last.low===null||range.high>=last.low-1)){
   last.low=last.low===null||range.low===null?null:Math.min(last.low,range.low)
  }else connected.push({...range})
 }
 // Version is unique within this creative; the newly read server row wins.
 const rows=new Map<number,T>()
 for(const row of [...(previous?.revisions||[]),...page.revisions])rows.set(row.revision,row)
 const nextBeforeVersion=connected[0]?.low??null
 return {revisions:Array.from(rows.values()).sort((a,b)=>b.revision-a.revision),historyRanges:connected,nextBeforeVersion,hasMore:nextBeforeVersion!==null}
}
