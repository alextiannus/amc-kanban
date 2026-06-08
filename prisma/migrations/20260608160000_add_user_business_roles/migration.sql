-- CreateTable
CREATE TABLE "UserBusinessRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBusinessRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBusinessRole_userId_role_key" ON "UserBusinessRole"("userId", "role");

-- CreateIndex
CREATE INDEX "UserBusinessRole_userId_idx" ON "UserBusinessRole"("userId");

-- CreateIndex
CREATE INDEX "UserBusinessRole_role_idx" ON "UserBusinessRole"("role");

-- AddForeignKey
ALTER TABLE "UserBusinessRole" ADD CONSTRAINT "UserBusinessRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
