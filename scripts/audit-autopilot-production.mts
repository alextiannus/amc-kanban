// Read-only deployment audit: no enabling, model invocation, generation or publication.
import {prisma} from '../src/lib/prisma.ts'
import {nativePool} from '../src/lib/ai-native/store.ts'
const pool=nativePool()
try{
 const settings=(await pool.query('SELECT enabled,count(*)::int AS count FROM amc_iaic.autopilot_settings GROUP BY enabled')).rows
 const runs=(await pool.query('SELECT step,status,left(error,180) AS error,count(*)::int AS count FROM amc_iaic.autopilot_runs GROUP BY step,status,error')).rows
 const outputs=(await pool.query('SELECT status,count(*)::int AS count FROM amc_iaic.autopilot_outputs GROUP BY status')).rows
 const published=await prisma.contentDraft.count({where:{id:{startsWith:'autopilot_'},OR:[{status:'published'},{publishedAt:{not:null}}]}})
 const ownership=(await pool.query(`SELECT count(*)::int AS count FROM amc_iaic.autopilot_runs r JOIN amc_iaic.amc_ai_requests a ON a.task_id=r.task_id WHERE a.intent->>'kind'='autopilot' AND a.subject_id=r.owner_id AND a.intent->>'runId'=r.id`)).rows[0].count
 console.log(JSON.stringify({version:process.env.RENDER_GIT_COMMIT,settings,runs,outputs,userAiBoundRuns:ownership,publishedAutopilotDrafts:published}))
}finally{await pool.end();await prisma.$disconnect()}
