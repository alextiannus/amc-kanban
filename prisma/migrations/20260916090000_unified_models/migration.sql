CREATE TABLE "ModelConnection" (
 id TEXT PRIMARY KEY, "previousId" TEXT REFERENCES "ModelConnection"(id),
 name TEXT NOT NULL, protocol TEXT NOT NULL, "baseUrl" TEXT NOT NULL,
 "encryptedSecret" TEXT NOT NULL, "secretFingerprint" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "actorId" TEXT NOT NULL
);
CREATE TABLE "ModelCatalogEntry" (
 id TEXT PRIMARY KEY, "connectionId" TEXT NOT NULL REFERENCES "ModelConnection"(id),
 "legacyId" TEXT, definition JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "actorId" TEXT NOT NULL
);
CREATE TABLE "ModelPolicyRevision" (
 version SERIAL PRIMARY KEY, configuration JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "actorId" TEXT NOT NULL
);
CREATE TABLE "ModelPolicyState" (
 id TEXT PRIMARY KEY CHECK(id='default'), version INTEGER REFERENCES "ModelPolicyRevision"(version)
);
INSERT INTO "ModelPolicyState" VALUES ('default',NULL);
CREATE TABLE "ModelPolicyValidation" (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, report JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "ModelPolicyJob" (
 id TEXT PRIMARY KEY, version INTEGER REFERENCES "ModelPolicyRevision"(version),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "ModelExecutionLog" (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, task TEXT NOT NULL, version INTEGER NOT NULL,
 "modelId" TEXT NOT NULL, "connectionId" TEXT NOT NULL, "targetModel" TEXT NOT NULL,
 "responseModel" TEXT, status TEXT NOT NULL, "latencyMs" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "ModelExecutionLog_recent" ON "ModelExecutionLog" ("createdAt" DESC);
CREATE TABLE "ModelOperation" (id TEXT PRIMARY KEY, version INTEGER NOT NULL REFERENCES "ModelPolicyRevision"(version), record JSONB NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE FUNCTION protect_model_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Model configurations are immutable; create a new version'; END $$;
CREATE TRIGGER model_connection_immutable BEFORE UPDATE OR DELETE ON "ModelConnection" FOR EACH ROW EXECUTE FUNCTION protect_model_revision();
CREATE TRIGGER model_catalog_immutable BEFORE UPDATE OR DELETE ON "ModelCatalogEntry" FOR EACH ROW EXECUTE FUNCTION protect_model_revision();
CREATE TRIGGER model_policy_immutable BEFORE UPDATE OR DELETE ON "ModelPolicyRevision" FOR EACH ROW EXECUTE FUNCTION protect_model_revision();
