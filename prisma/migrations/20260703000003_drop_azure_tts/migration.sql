-- Drop Azure Speech TTS columns from SystemConfig (replaced by MiniMax TTS)
ALTER TABLE "SystemConfig" DROP COLUMN IF EXISTS "azureSpeechKey";
ALTER TABLE "SystemConfig" DROP COLUMN IF EXISTS "azureSpeechRegion";
