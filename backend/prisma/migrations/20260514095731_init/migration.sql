-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'QUEUED', 'EXTRACTING_TEXT', 'ANALYZING_WITH_AI', 'RENAMING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "generatedName" TEXT,
    "finalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "storageKey" TEXT NOT NULL,
    "finalStorageKey" TEXT,
    "pageCount" INTEGER,
    "detectedLanguage" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "title" TEXT,
    "category" TEXT,
    "documentDate" TEXT,
    "issuer" TEXT,
    "recipient" TEXT,
    "referenceNumber" TEXT,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
