import {timingSafeEqual} from 'node:crypto'
import {readVideoLineage} from '@/lib/videoLineageAccess'
export async function POST(request:Request){
  const expected=Buffer.from(process.env.CONTENT_SERVICE_INTERNAL_TOKEN||''),actual=Buffer.from(request.headers.get('x-content-service-token')||'')
  if(!expected.length||expected.length!==actual.length||!timingSafeEqual(expected,actual))return Response.json({error:'Unauthorized'},{status:401})
  try{
    const raw=await request.text()
    if(Buffer.byteLength(raw,'utf8')>8*1024*1024)return Response.json({error:'video_editor_too_large'},{status:413})
    const body=JSON.parse(raw)
    return Response.json({editor:await readVideoLineage(body.actorId,body.brandId,body.editor)},{headers:{'Cache-Control':'no-store'}})
  }catch(error:any){return Response.json({error:error instanceof SyntaxError?'Invalid JSON':error.message},{status:error instanceof SyntaxError?400:error.status||503})}
}
