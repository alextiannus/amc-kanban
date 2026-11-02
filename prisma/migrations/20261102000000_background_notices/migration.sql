CREATE TABLE IF NOT EXISTS amc_background_notice_activation (id integer PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now());
INSERT INTO amc_background_notice_activation(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS amc_background_notice_watch (
 id text PRIMARY KEY,kind text NOT NULL,task_id text NOT NULL,user_id text NOT NULL,brand_id text NOT NULL,
 created_at timestamptz NOT NULL,next_check_at timestamptz NOT NULL DEFAULT now(),done boolean NOT NULL DEFAULT false,
 notified_state text,UNIQUE(kind,task_id,user_id)
);
CREATE INDEX IF NOT EXISTS amc_background_notice_due ON amc_background_notice_watch(next_check_at) WHERE done=false;

CREATE TABLE IF NOT EXISTS amc_push_keys(id integer PRIMARY KEY,public_key text NOT NULL,private_key text NOT NULL);
CREATE TABLE IF NOT EXISTS amc_push_preferences(user_id text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,muted boolean NOT NULL DEFAULT false,quiet boolean NOT NULL DEFAULT true,timezone text NOT NULL DEFAULT 'Asia/Singapore',last_seen_at timestamptz,last_sent_at timestamptz);
CREATE TABLE IF NOT EXISTS amc_push_devices(id text PRIMARY KEY,user_id text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,subscription text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS amc_push_devices_user ON amc_push_devices(user_id);
CREATE TABLE IF NOT EXISTS amc_push_deliveries(notification_id text PRIMARY KEY REFERENCES "Notification"(id) ON DELETE CASCADE,state text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now());
