import {nativeHttp} from '@/lib/ai-native/http'
import {listCreativeFavorites,setCreativeFavorite} from '@/lib/creative-favorites'
export const dynamic='force-dynamic'
type Context={params:Promise<{id:string}>}
export async function GET(r:Request,c:Context){const {id}=await c.params;return nativeHttp(r,u=>listCreativeFavorites(u,id,new URL(r.url).searchParams.get('view')==='keys'))}
export async function POST(r:Request,c:Context){const {id}=await c.params;return nativeHttp(r,(u,b)=>setCreativeFavorite(u,id,b))}
