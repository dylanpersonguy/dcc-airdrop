-- CreateTable
CREATE TABLE "InviteReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "redeemTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InviteReward_userId_idx" ON "InviteReward"("userId");

-- CreateIndex
CREATE INDEX "InviteReward_redeemed_idx" ON "InviteReward"("redeemed");

-- CreateIndex
CREATE UNIQUE INDEX "InviteReward_userId_invitedUserId_key" ON "InviteReward"("userId", "invitedUserId");

-- AddForeignKey
ALTER TABLE "InviteReward" ADD CONSTRAINT "InviteReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
