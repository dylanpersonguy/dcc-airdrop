-- CreateTable
CREATE TABLE "LockReferralReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lockId" TEXT NOT NULL,
    "lockOwnerId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "redeemTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LockReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LockReferralReward_userId_idx" ON "LockReferralReward"("userId");

-- CreateIndex
CREATE INDEX "LockReferralReward_lockId_idx" ON "LockReferralReward"("lockId");

-- CreateIndex
CREATE UNIQUE INDEX "LockReferralReward_userId_lockId_key" ON "LockReferralReward"("userId", "lockId");

-- AddForeignKey
ALTER TABLE "LockReferralReward" ADD CONSTRAINT "LockReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
