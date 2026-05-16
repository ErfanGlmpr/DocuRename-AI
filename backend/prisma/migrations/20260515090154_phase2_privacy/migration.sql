-- CreateEnum
CREATE TYPE "PrivacyMode" AS ENUM ('NONE', 'REDACTED');

-- CreateEnum
CREATE TYPE "AiInputMode" AS ENUM ('RAW_TEXT', 'REDACTED_TEXT', 'MINIMIZED_REDACTED_TEXT');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "aiInputMode" "AiInputMode" NOT NULL DEFAULT 'REDACTED_TEXT',
ADD COLUMN     "piiDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "piiEntityCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "piiProcessedAt" TIMESTAMP(3),
ADD COLUMN     "piiTokenMapEncrypted" JSONB,
ADD COLUMN     "privacyMode" "PrivacyMode" NOT NULL DEFAULT 'REDACTED',
ADD COLUMN     "redactedText" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
