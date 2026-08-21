ALTER TABLE "LLMConfig"
  ADD COLUMN IF NOT EXISTS "contentGenerationTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "LLMConfig"
SET
  "taskTags" = ARRAY(
    SELECT DISTINCT tag
    FROM unnest("taskTags" || ARRAY['marketing_plan', 'copywriting', 'instagram_content']) AS tag
    WHERE tag <> ''
  ),
  "contentGenerationTypes" = ARRAY['marketing_plan', 'instagram_content']
WHERE lower("provider") IN ('openai', 'custom_shim')
  AND (
    lower("displayName") LIKE '%glm%'
    OR lower("modelName") LIKE '%glm%'
    OR lower(coalesce("baseUrl", '')) LIKE '%bigmodel%'
  );

UPDATE "LLMConfig"
SET
  "taskTags" = ARRAY(
    SELECT DISTINCT tag
    FROM unnest("taskTags" || ARRAY['copywriting', 'tiktok_content', 'google_map_content']) AS tag
    WHERE tag <> ''
  ),
  "contentGenerationTypes" = ARRAY['tiktok_content', 'google_map_content']
WHERE lower("provider") = 'deepseek'
   OR lower("displayName") LIKE '%deepseek%'
   OR lower("modelName") LIKE '%deepseek%';
