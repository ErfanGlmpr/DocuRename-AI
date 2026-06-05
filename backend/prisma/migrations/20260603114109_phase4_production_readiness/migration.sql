-- CreateEnum
CREATE TYPE "AiEvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentStatus" ADD VALUE 'VIRUS_SCANNING';
ALTER TYPE "DocumentStatus" ADD VALUE 'INFECTED';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "chunkCount" INTEGER,
ADD COLUMN     "inputTextLength" INTEGER,
ADD COLUMN     "ocrTextLength" INTEGER,
ADD COLUMN     "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "processingDurationMs" INTEGER,
ADD COLUMN     "qualityScore" INTEGER,
ADD COLUMN     "virusScanResult" TEXT,
ADD COLUMN     "virusScanned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiEvaluationRun" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AiEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "category" TEXT,
    "documentDate" TEXT,
    "issuer" TEXT,
    "recipient" TEXT,
    "referenceNumber" TEXT,
    "suggestedFilename" TEXT,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT,
    "language" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
