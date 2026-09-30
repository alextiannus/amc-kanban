import {GET as scopedGET,POST as scopedPOST} from '../brands/[id]/inbox-state/route'
export const dynamic='force-dynamic'
export const GET=(request:Request)=>scopedGET(request,{params:Promise.resolve({id:''})})
export const POST=(request:Request)=>scopedPOST(request,{params:Promise.resolve({id:''})})
