export const dynamic='force-dynamic'
export async function GET(){
  return Response.json({ok:true,service:'amc-kanban',commit:process.env.RENDER_GIT_COMMIT||null,autopilot_research_auto_create_enabled:false},{headers:{'Cache-Control':'no-store'}})
}
