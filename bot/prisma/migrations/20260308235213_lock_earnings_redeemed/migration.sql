-- AlterTable
ALTER TABLE "DccLock" ADD COLUMN     "earningsRedeemTxId" TEXT,
ADD COLUMN     "earningsRedeemed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earningsRedeemedAt" TIMESTAMP(3);
