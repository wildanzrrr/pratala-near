-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Payment_occurredAt_idx" ON "Payment"("occurredAt");
