-- Additive: existing brand application credentials and tenant operations remain independent.
CREATE TABLE "LarkUserConnection" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE,
  "appId" TEXT NOT NULL,
  "tokenCipher" TEXT NOT NULL,
  "openId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "connectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "brandId")
);
CREATE TABLE "LarkOAuthState" (
  "stateHash" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "brandId" TEXT NOT NULL REFERENCES "Brand"("id") ON DELETE CASCADE,
  "authVersion" INTEGER NOT NULL,
  "appId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "verifierCipher" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumed" BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX "LarkOAuthState_userId_brandId_idx" ON "LarkOAuthState" ("userId", "brandId");
CREATE INDEX "LarkOAuthState_expiresAt_idx" ON "LarkOAuthState" ("expiresAt");
