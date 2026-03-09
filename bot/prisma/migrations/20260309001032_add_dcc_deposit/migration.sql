-- CreateTable
CREATE TABLE "DccDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DccDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DccDeposit_txId_key" ON "DccDeposit"("txId");

-- CreateIndex
CREATE INDEX "DccDeposit_userId_idx" ON "DccDeposit"("userId");

-- CreateIndex
CREATE INDEX "DccDeposit_txId_idx" ON "DccDeposit"("txId");

-- AddForeignKey
ALTER TABLE "DccDeposit" ADD CONSTRAINT "DccDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
