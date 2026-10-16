/*
  Warnings:

  - Added the required column `threadTalentId` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Message_assignmentId_createdAt_idx";

-- AlterTable
ALTER TABLE "FileObject" ADD COLUMN     "linkedId" TEXT,
ADD COLUMN     "linkedType" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "threadTalentId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Message_assignmentId_threadTalentId_createdAt_idx" ON "Message"("assignmentId", "threadTalentId", "createdAt");
