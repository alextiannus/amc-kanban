-- Seed MiniMax API key into SystemConfig
-- This upserts the minimaxApiKey field without overwriting other config values.
INSERT INTO "SystemConfig" (id, "minimaxApiKey")
VALUES (
  'default',
  'sk-cp-U2j5eHuxVCCP50WktSCxdulelvz7_AbAqUk1FMsMa_sF16V0dY3rWYmkzFSlzYF1vSABgKsVPmorWenEys2sj8dj8wy5xzJ4HRQV0lw-8ODGfekawGQ1tRo'
)
ON CONFLICT (id) DO UPDATE
  SET "minimaxApiKey" = EXCLUDED."minimaxApiKey";
