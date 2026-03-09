-- CreateEnum
CREATE TYPE "LockStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "DccLock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "LockStatus" NOT NULL DEFAULT 'ACTIVE',
    "earnedDcc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DccLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DccLock_userId_idx" ON "DccLock"("userId");

-- CreateIndex
CREATE INDEX "DccLock_status_idx" ON "DccLock"("status");

-- AddForeignKey
ALTER TABLE "DccLock" ADD CONSTRAINT "DccLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
