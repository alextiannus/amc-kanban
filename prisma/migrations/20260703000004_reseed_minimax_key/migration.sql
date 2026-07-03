-- Re-seed MiniMax API key into SystemConfig (idempotent UPSERT)
-- Ensures the key is present even if the previous seed (000002) was applied
-- before the SystemConfig row existed, or was rolled back.
INSERT INTO "SystemConfig" (id, "minimaxApiKey")
VALUES (
  'default',
  'sk-cp-U2j5eHuxVCCP50WktSCxdulelvz7_AbAqUk1FMsMa_sF16V0dY3rWYmkzFSlzYF1vSABgKsVPmorWenEys2sj8dj8wy5xzJ4HRQV0lw-8ODGfekawGQ1tRo'
)
ON CONFLICT (id) DO UPDATE
  SET "minimaxApiKey" = COALESCE("SystemConfig"."minimaxApiKey", EXCLUDED."minimaxApiKey");
-- NOTE: COALESCE preserves any key already set via Admin UI — only fills in if NULL
