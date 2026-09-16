CREATE TABLE "GlobalTextRevision" (
  version INTEGER PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  "connectionId" TEXT REFERENCES "LLMConfig"(id) ON DELETE RESTRICT,
  fingerprint TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "actorId" TEXT NOT NULL
);
CREATE TABLE "GlobalTextPolicy" (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  version INTEGER NOT NULL REFERENCES "GlobalTextRevision"(version)
);
INSERT INTO "GlobalTextRevision"(version,enabled,"actorId") VALUES (0,false,'migration');
INSERT INTO "GlobalTextPolicy" VALUES ('default',0);
CREATE TABLE "GlobalTextValidation" (
  id TEXT PRIMARY KEY,
  "connectionId" TEXT NOT NULL REFERENCES "LLMConfig"(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  report JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "GlobalTextCall" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  task TEXT NOT NULL,
  version INTEGER NOT NULL,
  "connectionId" TEXT NOT NULL,
  provider TEXT NOT NULL,
  "targetModel" TEXT NOT NULL,
  "responseModel" TEXT,
  status TEXT NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX "GlobalTextCall_recent" ON "GlobalTextCall" ("createdAt" DESC);
CREATE TABLE "GlobalTextJob" (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL REFERENCES "GlobalTextRevision"(version),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- A referenced connection is immutable. Create a new connection to rotate credentials.
CREATE FUNCTION protect_global_text_connection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "GlobalTextRevision" WHERE "connectionId" = OLD.id) THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Global text connection is retained by a policy revision; create a new connection'; END IF;
  IF (NEW.provider, NEW."modelName", NEW."baseUrl", NEW."apiKey", NEW."timeoutMs") IS DISTINCT FROM
     (OLD.provider, OLD."modelName", OLD."baseUrl", OLD."apiKey", OLD."timeoutMs") THEN
   RAISE EXCEPTION 'Global text connection is immutable; create a new connection and switch policy';
  END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER global_text_connection_guard BEFORE UPDATE OR DELETE ON "LLMConfig"
 FOR EACH ROW EXECUTE FUNCTION protect_global_text_connection();
