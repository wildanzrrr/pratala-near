-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('id', 'en');

-- CreateEnum
CREATE TYPE "UserIntent" AS ENUM ('farmer', 'buyer', 'verifier', 'supplier');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('PLOT', 'FIELD_VISIT', 'COOP_REVIEW', 'WEIGH_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "AiVerdict" AS ENUM ('pass', 'review', 'fail');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('FUNDING', 'PAYOUT', 'REFUND', 'FEE', 'INPUT_PURCHASE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('SEED', 'FERTILIZER', 'SOIL', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "accountId" TEXT NOT NULL,
    "displayName" TEXT,
    "region" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'id',
    "phone" TEXT,
    "intent" "UserIntent",
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "areaM2" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "plotHash" TEXT NOT NULL,
    "gpsHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "lotId" TEXT,
    "plotId" TEXT,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCheck" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'near-ai-cloud',
    "model" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "chatId" TEXT,
    "verdict" "AiVerdict" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "findings" JSONB NOT NULL,
    "extracted" JSONB NOT NULL,
    "summaryId" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "responseHash" TEXT NOT NULL,
    "requestHash" TEXT,
    "signature" JSONB,
    "signatureAvailable" BOOLEAN NOT NULL DEFAULT false,
    "verifyUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "lotId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "variety" TEXT,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "projectedKg" INTEGER NOT NULL,
    "harvestMonth" TEXT NOT NULL,
    "plotHash" TEXT NOT NULL,
    "gpsHash" TEXT NOT NULL,
    "areaM2" INTEGER,
    "pricePerKg" TEXT NOT NULL,
    "fundingTotal" TEXT NOT NULL,
    "escrow" TEXT NOT NULL,
    "funder" TEXT,
    "fundedAtMs" BIGINT,
    "actualKg" INTEGER,
    "grade" TEXT,
    "settledAtMs" BIGINT,
    "claims" JSONB NOT NULL,
    "claimLock" BOOLEAN NOT NULL DEFAULT false,
    "attestations" JSONB NOT NULL,
    "createdAtMs" BIGINT NOT NULL,
    "raw" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("lotId")
);

-- CreateTable
CREATE TABLE "LotEvent" (
    "id" TEXT NOT NULL,
    "lotId" TEXT,
    "standard" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "txHash" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "executorId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "blockHash" TEXT,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "lotId" TEXT,
    "orderId" TEXT,
    "type" "PaymentType" NOT NULL,
    "fromAccount" TEXT NOT NULL,
    "toAccount" TEXT NOT NULL,
    "amountBase" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "txHash" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "priceBase" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "amountBase" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentsQuote" (
    "id" TEXT NOT NULL,
    "dry" BOOLEAN NOT NULL,
    "originAsset" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "depositAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentsQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lotId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_nonce_key" ON "AuthChallenge"("nonce");

-- CreateIndex
CREATE INDEX "AuthChallenge_accountId_idx" ON "AuthChallenge"("accountId");

-- CreateIndex
CREATE INDEX "Plot_ownerId_idx" ON "Plot"("ownerId");

-- CreateIndex
CREATE INDEX "Evidence_sha256_idx" ON "Evidence"("sha256");

-- CreateIndex
CREATE INDEX "Evidence_lotId_idx" ON "Evidence"("lotId");

-- CreateIndex
CREATE INDEX "Evidence_plotId_idx" ON "Evidence"("plotId");

-- CreateIndex
CREATE INDEX "AiCheck_evidenceId_idx" ON "AiCheck"("evidenceId");

-- CreateIndex
CREATE INDEX "Lot_status_idx" ON "Lot"("status");

-- CreateIndex
CREATE INDEX "Lot_farmerId_idx" ON "Lot"("farmerId");

-- CreateIndex
CREATE INDEX "Lot_holder_idx" ON "Lot"("holder");

-- CreateIndex
CREATE INDEX "LotEvent_lotId_idx" ON "LotEvent"("lotId");

-- CreateIndex
CREATE INDEX "LotEvent_event_idx" ON "LotEvent"("event");

-- CreateIndex
CREATE UNIQUE INDEX "LotEvent_txHash_receiptId_event_index_key" ON "LotEvent"("txHash", "receiptId", "event", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_dedupeKey_key" ON "Payment"("dedupeKey");

-- CreateIndex
CREATE INDEX "Payment_lotId_idx" ON "Payment"("lotId");

-- CreateIndex
CREATE INDEX "Payment_fromAccount_idx" ON "Payment"("fromAccount");

-- CreateIndex
CREATE INDEX "Payment_toAccount_idx" ON "Payment"("toAccount");

-- CreateIndex
CREATE INDEX "InputListing_category_idx" ON "InputListing"("category");

-- CreateIndex
CREATE INDEX "InputListing_sellerId_idx" ON "InputListing"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_memo_key" ON "Order"("memo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_txHash_key" ON "Order"("txHash");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_accountId_createdAt_idx" ON "Notification"("accountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "Plot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheck" ADD CONSTRAINT "AiCheck_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputListing" ADD CONSTRAINT "InputListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "InputListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
