-- Add minimaxApiKey column to SystemConfig for MiniMax LLM integration
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "minimaxApiKey" TEXT;
