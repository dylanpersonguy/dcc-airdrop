-- CreateTable
CREATE TABLE "SolanaWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolanaWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolanaWallet_userId_key" ON "SolanaWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SolanaWallet_publicKey_key" ON "SolanaWallet"("publicKey");

-- CreateIndex
CREATE INDEX "SolanaWallet_publicKey_idx" ON "SolanaWallet"("publicKey");

-- AddForeignKey
ALTER TABLE "SolanaWallet" ADD CONSTRAINT "SolanaWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
