-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "caseOwnerId" TEXT,
ADD COLUMN     "interim" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "beneficialOwner" TEXT,
ADD COLUMN     "establishedOn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TalentProfile" ADD COLUMN     "recruitmentChannel" TEXT,
ADD COLUMN     "referringOrganisation" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cohortId" TEXT;

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "valueLimit" INTEGER,
    "payLaterEligible" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_name_key" ON "Cohort"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;
