/*
  Warnings:

  - Added the required column `respondBy` to the `Invitation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Proposal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelRequestedById" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "respondBy" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "deadlineMissedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "counterAmount" INTEGER,
ADD COLUMN     "counterReason" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
