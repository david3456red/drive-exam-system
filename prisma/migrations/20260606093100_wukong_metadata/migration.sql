-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN "vehicleCode" TEXT;
ALTER TABLE "QuestionBank" ADD COLUMN "subjectCode" TEXT;
ALTER TABLE "QuestionBank" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QuestionBank" ADD COLUMN "mockQuestionCount" INTEGER;
ALTER TABLE "QuestionBank" ADD COLUMN "mockDurationMs" INTEGER;
ALTER TABLE "QuestionBank" ADD COLUMN "mockPassScore" INTEGER;
ALTER TABLE "QuestionBank" ADD COLUMN "sourceSite" TEXT;
ALTER TABLE "QuestionBank" ADD COLUMN "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN "sourceSite" TEXT;
ALTER TABLE "Question" ADD COLUMN "sourceQuestionId" TEXT;
ALTER TABLE "Question" ADD COLUMN "sourceMeta" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_sourceSite_sourceKey_key" ON "QuestionBank"("sourceSite", "sourceKey");

-- CreateIndex
CREATE INDEX "QuestionBank_vehicleCode_subjectCode_displayOrder_idx" ON "QuestionBank"("vehicleCode", "subjectCode", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Question_bankId_sourceSite_sourceQuestionId_key" ON "Question"("bankId", "sourceSite", "sourceQuestionId");

-- CreateIndex
CREATE INDEX "Question_sourceSite_sourceQuestionId_idx" ON "Question"("sourceSite", "sourceQuestionId");
