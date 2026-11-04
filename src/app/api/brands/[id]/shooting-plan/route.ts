import {after} from 'next/server'
import {coordinateShoot} from '@/lib/asset-library/shoot-coordinator'
import {nativeHttp} from '@/lib/ai-native/http'
import {listMonthlyShooting,prepareMonthlyShooting,updateMonthlyShooting} from '@/lib/asset-library/monthly-shooting'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(r:Request,c:Context){const {id}=await c.params;return nativeHttp(r,u=>listMonthlyShooting(u,id))}
export async function POST(r:Request,c:Context){
 const {id}=await c.params
 return nativeHttp(r,async(u,b)=>{
  if(b?.action==='coordinate')return coordinateShoot(u,id,b)
  if(b?.action!=='prepare')return updateMonthlyShooting(u,id,b)
  const saved=await prepareMonthlyShooting(u,id,b)
  if(saved.count>0&&saved.requestId&&saved.month){
   after(async()=>{try{await coordinateShoot(u,id,{month:saved.month,ids:[saved.requestId],language:b.language})}catch{console.warn('[shoot-coordinator] preparation deferred')}})
  }
  return saved
 })
}
