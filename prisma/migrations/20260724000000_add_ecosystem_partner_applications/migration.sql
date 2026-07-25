CREATE TABLE "EcosystemPartnerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'amc-official-website',
    "agreementVersion" TEXT NOT NULL,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcosystemPartnerApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcosystemPartnerApplication_email_key" ON "EcosystemPartnerApplication"("email");
CREATE INDEX "EcosystemPartnerApplication_status_idx" ON "EcosystemPartnerApplication"("status");
CREATE INDEX "EcosystemPartnerApplication_city_idx" ON "EcosystemPartnerApplication"("city");
CREATE INDEX "EcosystemPartnerApplication_submittedAt_idx" ON "EcosystemPartnerApplication"("submittedAt");
