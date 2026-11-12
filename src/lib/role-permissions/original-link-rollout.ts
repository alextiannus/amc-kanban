import {validateGrants} from './contract.ts'

/** Resolve an explicitly supplied, verified role ID; never infer identity from a label. */
export function originalLinkPolicyAdditions(snapshot:any,partTimeRoleId:string){
 if(!partTimeRoleId||partTimeRoleId==='AMC_PRINCIPAL')throw Error('Specify the verified part-time principal role ID')
 return ['AMC_PRINCIPAL',partTimeRoleId].map(id=>{
  const role=snapshot.roles?.find((r:any)=>r.id===id)
  if(!role?.enabled||id===partTimeRoleId&&role.builtIn)throw Error(`Missing, disabled or invalid principal role: ${id}`)
  if(!Array.isArray(snapshot.policies?.[id])||!Number.isSafeInteger(snapshot.versions?.[id]))throw Error(`Missing versioned policy: ${id}`)
  const before=validateGrants(snapshot.policies[id])
  const grants=validateGrants([...before,'draft.read','draft.view-source-link'])
  return {id,name:role.name,expectedVersion:snapshot.versions[id],before,grants,added:grants.filter(key=>!before.includes(key))}
 })
}
