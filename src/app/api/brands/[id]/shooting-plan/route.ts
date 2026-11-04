import {coordinateShoot} from '@/lib/asset-library/shoot-coordinator'
import {nativeHttp} from '@/lib/ai-native/http'
import {listMonthlyShooting,prepareMonthlyShooting,updateMonthlyShooting} from '@/lib/asset-library/monthly-shooting'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(r:Request,c:Context){const {id}=await c.params;return nativeHttp(r,u=>listMonthlyShooting(u,id))}
export async function POST(r:Request,c:Context){const {id}=await c.params;return nativeHttp(r,(u,b)=>b?.action==='coordinate'?coordinateShoot(u,id,b):b?.action==='prepare'?prepareMonthlyShooting(u,id,b):updateMonthlyShooting(u,id,b))}
