-- CreateTable
CREATE TABLE "GameTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "betAmount" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameTransaction_userId_idx" ON "GameTransaction"("userId");

-- CreateIndex
CREATE INDEX "GameTransaction_game_idx" ON "GameTransaction"("game");

-- CreateIndex
CREATE INDEX "GameTransaction_createdAt_idx" ON "GameTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "GameTransaction" ADD CONSTRAINT "GameTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
