-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'DEPOSITED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "DccPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "dccAmount" DOUBLE PRECISION NOT NULL,
    "bridgeTransferId" TEXT,
    "depositAddress" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "solanaTxId" TEXT,
    "redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemedAt" TIMESTAMP(3),
    "redeemTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DccPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DccPurchase_userId_idx" ON "DccPurchase"("userId");

-- CreateIndex
CREATE INDEX "DccPurchase_status_idx" ON "DccPurchase"("status");

-- AddForeignKey
ALTER TABLE "DccPurchase" ADD CONSTRAINT "DccPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
