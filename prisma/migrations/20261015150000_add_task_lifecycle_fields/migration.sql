-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "startDate" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tasks_projectId_archivedAt_idx" ON "tasks"("projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "tasks_completedAt_idx" ON "tasks"("completedAt");
