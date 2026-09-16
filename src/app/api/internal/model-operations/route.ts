import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
function authorized(r:Request){const token=process.env.CONTENT_SERVICE_INTERNAL_TOKEN;return !!token&&r.headers.get('x-content-service-token')===token}
export async function GET(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  const id=new URL(request.url).searchParams.get('id')
  const rows:any[]=await prisma.$queryRawUnsafe('SELECT record FROM "ModelOperation" WHERE id=$1',id)
  return NextResponse.json({record:rows[0]?.record||null},{headers:{'Cache-Control':'no-store'}})
}
export async function POST(request:Request){
  if(!authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401})
  try{
    const {record,claim}=await request.json()
    if(typeof record?.id!=='string'||!record.id.startsWith('central-asset:')||!Number.isInteger(record.version))throw new Error('Invalid operation')
    const allowed=['id','version','taskType','modelName','modelId','status','providerJobId','result','secretRef','baseUrl','error','startedAt']
    if(Object.keys(record).some(key=>!allowed.includes(key)))throw new Error('Invalid operation fields')
    if(!['asset_image_analysis','asset_category_summary'].includes(record.taskType))throw new Error('Invalid task')
    const rows:any[]=await prisma.$queryRawUnsafe('INSERT INTO "ModelOperation" (id,version,record) VALUES ($1,$2,$3::jsonb) ON CONFLICT(id) '+(claim?'DO NOTHING':'DO UPDATE SET record=EXCLUDED.record,"updatedAt"=now() WHERE "ModelOperation".version=EXCLUDED.version')+' RETURNING id',record.id,record.version,JSON.stringify(record))
    if(!rows.length&&!claim)return NextResponse.json({error:'Operation version conflict'},{status:409})
    return NextResponse.json({ok:true,record:{claimed:rows.length===1}})
  }catch{return NextResponse.json({error:'Model operation could not be persisted'},{status:400})}
}
