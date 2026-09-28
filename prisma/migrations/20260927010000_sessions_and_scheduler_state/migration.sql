-- Old refresh tokens were hashed with bcrypt and carry no jti, so the new
-- /auth/refresh flow can't validate any of them. Clear them; users log in again.
DELETE FROM "RefreshToken";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- AlterTable
ALTER TABLE "Monitor" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastStatus" "CheckStatus";

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the cached state from each monitor's latest check, so existing
-- monitors keep their UP/DOWN history across the upgrade.
UPDATE "Monitor" AS m
SET "lastStatus" = c."status", "lastCheckedAt" = c."checkedAt"
FROM (
  SELECT DISTINCT ON ("monitorId") "monitorId", "status", "checkedAt"
  FROM "Check"
  ORDER BY "monitorId", "checkedAt" DESC
) AS c
WHERE c."monitorId" = m."id";
