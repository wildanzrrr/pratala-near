-- Fractional harvest lots: buyers purchase kg and hold share NFTs ("lot-N:M").
-- Lot drops the single-funder/holder columns (one lot now has many buyers) and gains the
-- sold/remaining kg counters; new LotShare mirrors each share NFT and its refund claim state.

ALTER TABLE "Lot" DROP COLUMN "funder";
ALTER TABLE "Lot" DROP COLUMN "holder";

ALTER TABLE "Lot" ADD COLUMN "soldKg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lot" ADD COLUMN "remainingKg" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lot" ADD COLUMN "shareCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LotShare" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "kg" INTEGER NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LotShare_shareId_key" ON "LotShare"("shareId");
CREATE INDEX "LotShare_lotId_idx" ON "LotShare"("lotId");
CREATE INDEX "LotShare_holder_idx" ON "LotShare"("holder");
