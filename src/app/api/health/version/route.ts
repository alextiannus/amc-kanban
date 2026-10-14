export const dynamic='force-dynamic'
export async function GET(){
  return Response.json({ok:true,service:'amc-kanban',commit:process.env.RENDER_GIT_COMMIT||null},{headers:{'Cache-Control':'no-store'}})
}
