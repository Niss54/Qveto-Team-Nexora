BEGIN;

-- Keep legacy Projects readable without assigning owners or dates automatically.
ALTER TABLE "projects"
ADD COLUMN "startDate" TIMESTAMP(3),
ADD COLUMN "dueDate" TIMESTAMP(3),
ADD COLUMN "ownerId" TEXT;

CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

ALTER TABLE "projects"
ADD CONSTRAINT "projects_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
