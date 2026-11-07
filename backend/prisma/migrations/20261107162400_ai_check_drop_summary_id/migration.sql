-- AI checks return a single English summary (summaryEn); the UI is English-only.
ALTER TABLE "AiCheck" DROP COLUMN "summaryId";
