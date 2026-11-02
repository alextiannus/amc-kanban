import {prisma} from '../prisma'
export async function ensureBackgroundNoticeSchema(db:any=prisma){
 await db.$transaction(async(tx:any)=>{
  await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext('amc-background-notice-schema'))::text`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_background_notice_activation (id integer PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now())`)
  await tx.$executeRawUnsafe(`INSERT INTO amc_background_notice_activation(id) VALUES(1) ON CONFLICT DO NOTHING`)
  await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS amc_background_notice_watch (
   id text PRIMARY KEY,kind text NOT NULL,task_id text NOT NULL,user_id text NOT NULL,brand_id text NOT NULL,
   created_at timestamptz NOT NULL,next_check_at timestamptz NOT NULL DEFAULT now(),done boolean NOT NULL DEFAULT false,
   notified_state text,UNIQUE(kind,task_id,user_id))`)
  await tx.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS amc_background_notice_due ON amc_background_notice_watch(next_check_at) WHERE done=false`)
 })
}
