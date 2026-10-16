/*
  Warnings:

  - Added the required column `authorRole` to the `DisputeNote` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "accountAction" TEXT,
ADD COLUMN     "alertsSent" TEXT[],
ADD COLUMN     "appealBy" TIMESTAMP(3),
ADD COLUMN     "appealedById" TEXT,
ADD COLUMN     "clientAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "decisionStatus" TEXT,
ADD COLUMN     "finalDecision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "talentAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DisputeNote" ADD COLUMN     "authorRole" TEXT NOT NULL,
ADD COLUMN     "fileIds" TEXT[],
ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false;
