/** Slow preview storage must not queue every streaming delta behind completion. */
export function latestPreviewWriter(write:(text:string)=>Promise<unknown>){
 let pending:string|null=null,running:Promise<void>|null=null
 const start=()=>{
  if(running)return
  running=(async()=>{while(pending!==null){const text=pending;pending=null;try{await write(text)}catch{/* Preview is not a save receipt. */}}})().finally(()=>{running=null;if(pending!==null)start()})
 }
 return {push(text:string){pending=text;start()},async flush(){while(running)await running}}
}
