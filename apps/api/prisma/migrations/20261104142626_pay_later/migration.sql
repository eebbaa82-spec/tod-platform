-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LENDER_VIEWER';

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "payLaterEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payLaterLimit" INTEGER;

-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "payLaterCap" INTEGER;

-- CreateTable
CREATE TABLE "PayLaterAgreement" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "tenorDays" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "application" JSONB NOT NULL,
    "lender" TEXT NOT NULL,
    "lenderRef" TEXT,
    "lenderReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reassessment" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgementText" TEXT,
    "acknowledgementIp" TEXT,
    "drawdownRef" TEXT,
    "disbursed" INTEGER NOT NULL DEFAULT 0,
    "repaid" INTEGER NOT NULL DEFAULT 0,
    "defaultedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayLaterAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLaterInstallment" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "remindersSent" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLaterInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLaterRepayment" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLaterRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLaterException" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "installmentId" TEXT,
    "newDueOn" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PayLaterException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLaterPortfolioEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "arrearsShare" DOUBLE PRECISION NOT NULL,
    "detail" JSONB NOT NULL,
    "actorId" TEXT,
    "flaggedForSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLaterPortfolioEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterAgreement_ref_key" ON "PayLaterAgreement"("ref");

-- CreateIndex
CREATE INDEX "PayLaterAgreement_clientId_idx" ON "PayLaterAgreement"("clientId");

-- CreateIndex
CREATE INDEX "PayLaterAgreement_assignmentId_idx" ON "PayLaterAgreement"("assignmentId");

-- CreateIndex
CREATE INDEX "PayLaterAgreement_status_idx" ON "PayLaterAgreement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterInstallment_milestoneId_key" ON "PayLaterInstallment"("milestoneId");

-- CreateIndex
CREATE INDEX "PayLaterInstallment_dueOn_idx" ON "PayLaterInstallment"("dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterRepayment_reference_key" ON "PayLaterRepayment"("reference");

-- AddForeignKey
ALTER TABLE "PayLaterAgreement" ADD CONSTRAINT "PayLaterAgreement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLaterInstallment" ADD CONSTRAINT "PayLaterInstallment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PayLaterAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLaterRepayment" ADD CONSTRAINT "PayLaterRepayment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PayLaterAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLaterException" ADD CONSTRAINT "PayLaterException_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PayLaterAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
