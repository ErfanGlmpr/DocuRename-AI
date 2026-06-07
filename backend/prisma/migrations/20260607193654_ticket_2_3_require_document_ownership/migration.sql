/*
  Warnings:

  - Made the column `userId` on table `Document` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `Document` required. This step will fail if there are existing NULL values in that column.

  Migration strategy:
  - Delete any legacy documents that have no owner (created before auth was enforced in Ticket 2.2).
    This only affects local development data — production will never have ownerless documents.
*/

-- Delete ownerless documents (no userId or no organizationId) created before auth enforcement
DELETE FROM "AiEvaluationRun" WHERE "documentId" IN (
  SELECT id FROM "Document" WHERE "userId" IS NULL OR "organizationId" IS NULL
);

DELETE FROM "AuditLog" WHERE "documentId" IN (
  SELECT id FROM "Document" WHERE "userId" IS NULL OR "organizationId" IS NULL
);

DELETE FROM "Document" WHERE "userId" IS NULL OR "organizationId" IS NULL;

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userId_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
