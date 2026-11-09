-- CreateTable
CREATE TABLE "SponsoredAccount" (
    "accountId" TEXT NOT NULL,
    "authSub" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "txHash" TEXT,
    "seededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsoredAccount_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SponsoredAccount_authSub_key" ON "SponsoredAccount"("authSub");
