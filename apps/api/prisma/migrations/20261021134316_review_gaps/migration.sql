-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "vars" JSONB;

-- AlterTable
ALTER TABLE "PaymentInstruction" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "instructionsAm" TEXT,
ADD COLUMN     "instructionsEn" TEXT;

-- AlterTable
ALTER TABLE "TalentProfile" ADD COLUMN     "photoFileId" TEXT;
