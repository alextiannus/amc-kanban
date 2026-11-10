import { nativePool } from '../ai-native/store';
let initialized: Promise<void> | undefined;
let database: ReturnType<typeof nativePool> | undefined;
export async function dailyDb() {
    const pool = database ||= (nativePool());
    if (!initialized)
        initialized = pool.query(`CREATE SCHEMA IF NOT EXISTS amc_iaic;
 CREATE TABLE IF NOT EXISTS amc_iaic.daily_publishing_policy(brand_id text PRIMARY KEY REFERENCES public."Brand"(id) ON DELETE CASCADE,owner_id text NOT NULL REFERENCES public."User"(id),enabled boolean NOT NULL DEFAULT false,account_ids text[] NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS amc_iaic.daily_publishing_slots(id text PRIMARY KEY,brand_id text NOT NULL REFERENCES public."Brand"(id) ON DELETE CASCADE,account_id text NOT NULL REFERENCES public."SocialAccount"(id),local_day text NOT NULL,scheduled_at timestamptz NOT NULL,policy_revision integer NOT NULL,stage text NOT NULL,source jsonb,draft_id text,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(brand_id,account_id,local_day));`).then(() => { }).catch(e => { initialized = undefined; throw e; });
    await initialized;
    return pool;
}
