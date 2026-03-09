-- CreateIndex
CREATE INDEX "DccPurchase_userId_status_idx" ON "DccPurchase"("userId", "status");

-- CreateIndex
CREATE INDEX "ReferralEvent_referrerUserId_tier_idx" ON "ReferralEvent"("referrerUserId", "tier");
