import {NextResponse} from 'next/server'
import {authenticateCurrentRequest} from '@/lib/auth-v2'
export async function POST(){
 const principal=await authenticateCurrentRequest()
 if(!principal)return NextResponse.json({error:'Unauthorized'},{status:401})
 return NextResponse.json({error:'Manage your single AI token in Profile → Configure AI',url:'/profile/ai'},{status:410})
}
