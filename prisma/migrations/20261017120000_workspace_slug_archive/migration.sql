BEGIN;

-- Add workspace lifecycle fields without dropping or rewriting existing records.
ALTER TABLE "workspaces"
ADD COLUMN "slug" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Backfill deterministic slugs in a stable order. Existing duplicate slugs are
-- resolved with numeric suffixes; workspace names and relationships are untouched.
DO $$
DECLARE
  workspace_row RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix INTEGER;
BEGIN
  FOR workspace_row IN
    SELECT "id", "orgId", "name"
    FROM "workspaces"
    ORDER BY "orgId", "createdAt", "id"
  LOOP
    base_slug := lower(regexp_replace(
      regexp_replace(btrim(workspace_row."name"), '[^A-Za-z0-9[:space:]_-]', '', 'g'),
      '[[:space:]_-]+', '-', 'g'
    ));
    base_slug := trim(BOTH '-' FROM base_slug);
    IF base_slug = '' THEN
      base_slug := 'workspace';
    END IF;

    candidate_slug := base_slug;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1 FROM "workspaces"
      WHERE "orgId" = workspace_row."orgId" AND "slug" = candidate_slug
    ) LOOP
      candidate_slug := base_slug || '-' || suffix::TEXT;
      suffix := suffix + 1;
    END LOOP;

    UPDATE "workspaces" SET "slug" = candidate_slug WHERE "id" = workspace_row."id";
  END LOOP;
END $$;

-- Do not silently alter existing names to satisfy the new name constraint.
-- Abort this migration atomically if existing data already violates it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "workspaces"
    GROUP BY "orgId", lower(regexp_replace("name", '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Workspace migration blocked: duplicate names ignoring case and surrounding spaces exist within an organization. Resolve these records before retrying.';
  END IF;
END $$;

ALTER TABLE "workspaces" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "workspaces_orgId_slug_key" ON "workspaces"("orgId", "slug");

-- PostgreSQL functional unique index enforces trimmed, case-insensitive names
-- for active and archived workspaces alike. Prisma schema stores the columns;
-- this expression index is maintained in migration SQL.
CREATE UNIQUE INDEX "workspaces_orgId_normalizedName_key"
ON "workspaces"("orgId", lower(regexp_replace("name", '^[[:space:]]+|[[:space:]]+$', '', 'g')));

COMMIT;
