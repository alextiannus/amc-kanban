import {timingSafeEqual} from 'node:crypto'
import {CreativeRevisionError} from '@/lib/brand-plan/creativeRevisionContract'
import {ingestTrustedVideoFeedback,VIDEO_FEEDBACK_EVENT_MAX_BYTES} from '@/lib/brand-plan/videoFeedbackIngestion'

function token(request:Request){
  const expected=Buffer.from(process.env.CONTENT_SERVICE_INTERNAL_TOKEN||''),actual=Buffer.from(request.headers.get('x-content-service-token')||'')
  return expected.length&&expected.length===actual.length&&timingSafeEqual(expected,actual)?expected.toString('utf8'):null
}
export async function POST(request:Request){
  const sharedToken=token(request)
  if(!sharedToken)return Response.json({error:'Unauthorized'},{status:401})
  try{
    const raw=await request.text()
    if(Buffer.byteLength(raw,'utf8')>VIDEO_FEEDBACK_EVENT_MAX_BYTES)return Response.json({error:'video_feedback_event_too_large'},{status:413})
    const result=await ingestTrustedVideoFeedback(JSON.parse(raw),{method:request.method,path:new URL(request.url).pathname,deliveredAt:request.headers.get('x-amc-video-feedback-delivered-at')||'',nonce:request.headers.get('x-amc-video-feedback-nonce')||'',signature:request.headers.get('x-amc-video-feedback-signature')||''},sharedToken)
    return Response.json(result,{status:result.replayed?200:201,headers:{'Cache-Control':'no-store'}})
  }catch(error:any){
    const syntax=error instanceof SyntaxError,status=syntax?400:error instanceof CreativeRevisionError?error.status:503
    return Response.json({error:syntax?'invalid_json':status===404?'Not found':error?.code||'video_feedback_ingestion_failed'},{status})
  }
}
