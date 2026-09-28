-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureThreshold" INTEGER NOT NULL DEFAULT 2;

-- Emails are now stored lowercased (the API normalizes them), so lowercase
-- existing ones. An address that only differs by case from another account's
-- is left as-is rather than failing the migration on the unique index.
UPDATE "User" AS u
SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS o
    WHERE o."id" <> u."id" AND lower(trim(o."email")) = lower(trim(u."email"))
  );
