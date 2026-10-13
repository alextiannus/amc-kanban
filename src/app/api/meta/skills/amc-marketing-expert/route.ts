import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  const archive=new URL(request.url).searchParams.get('format')==='zip'
  const file=archive?'public/skills/amc-marketing-expert.zip':'skills/amc-marketing-expert/SKILL.md'
  const content=await readFile(path.join(process.cwd(),file))
  return new Response(new Uint8Array(content),{headers:{
    'Content-Type':archive?'application/zip':'text/markdown; charset=utf-8',
    'Content-Disposition':`attachment; filename="${archive?'amc-marketing-expert.zip':'SKILL.md'}"`,
    'Cache-Control':'public, max-age=300',
    'Access-Control-Allow-Origin':'*',
    'ETag':`"${createHash('sha256').update(content).digest('hex')}"`,
  }})
}
