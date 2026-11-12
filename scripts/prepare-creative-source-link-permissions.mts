import {originalLinkPolicyAdditions} from '../src/lib/role-permissions/original-link-rollout.ts'

// Defaults to a read-only preview. Credentials stay in the environment.
const base=process.env.AMC_MAIN_APP_URL?.replace(/\/+$/,''),key=process.env.AMC_ADMIN_API_KEY
const partTimeRoleId=process.env.AMC_PART_TIME_PRINCIPAL_ROLE_ID
if(!base||!key)throw Error('Set AMC_MAIN_APP_URL and AMC_ADMIN_API_KEY')
const origin=new URL(base).origin
if(!['https:','http:'].includes(new URL(base).protocol))throw Error('Invalid AMC_MAIN_APP_URL')
async function api(path:string,body?:unknown){
 const response=await fetch(base+path,{method:body?'PUT':'GET',headers:{Authorization:`Bearer ${key}`,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw Error(`Role policy API returned HTTP ${response.status}; stop and inspect configuration/version`)
 return response.json()
}
const snapshot=await api('/api/admin/role-permissions')
if(!partTimeRoleId){
 console.log(JSON.stringify({apply:false,roles:snapshot.roles.map(({id,name,enabled,builtIn}:any)=>({id,name,enabled,builtIn})),next:'Verify the part-time principal role and set AMC_PART_TIME_PRINCIPAL_ROLE_ID; no policies were changed'},null,2))
}else{
 if(!snapshot.contentReady||!snapshot.modules?.some((m:any)=>m.id==='draft'&&m.actions.includes('view-source-link')))throw Error('Deploy matching Content and Kanban permission contracts first')
 const plans=originalLinkPolicyAdditions(snapshot,partTimeRoleId)
 const apply=process.argv.slice(2).includes('--apply')
 console.log(JSON.stringify({apply,changes:plans.map(({id,name,expectedVersion,added})=>({id,name,expectedVersion,added}))},null,2))
 if(apply){
  for(const plan of plans){
   if(!plan.added.length)continue
   await api(`/api/admin/role-permissions/${encodeURIComponent(plan.id)}`,{expectedVersion:plan.expectedVersion,grants:plan.grants})
  }
  const after=await api('/api/admin/role-permissions')
  for(const plan of plans)if(plan.grants.some(key=>!after.policies?.[plan.id]?.includes(key)))throw Error(`Policy read-back failed: ${plan.id}`)
  console.log('Verified both role policies; prior grants preserved. Existing policy API records actor and audit.')
 }
}
