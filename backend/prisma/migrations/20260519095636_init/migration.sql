-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "processingDuration" INTEGER,
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "totalTokens" INTEGER;
