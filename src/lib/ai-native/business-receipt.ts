/** Mechanical receipts are independent of the model's final prose. */
export function businessReceipts(calls:readonly {capability:string;status:string;result?:any}[]){
 return calls.filter(c=>c.capability==='amc.business.write'&&c.status==='succeeded').map(c=>{
  const r=c.result||{};let data:any
  try{data=JSON.parse(r.result?.content?.find((v:any)=>v.type==='text')?.text)}catch{}
  const saved=['board_save_draft','board_save_topic','board_update_asset'].includes(r.tool)
  const state=r.state==='failed'||data?.ok===false?'failed':r.verified&&data?.ok===true?(saved?'saved':r.tool==='generate_brand_research_report'?'accepted':'returned'):'unknown'
  return {tool:r.tool,state}
 })
}
