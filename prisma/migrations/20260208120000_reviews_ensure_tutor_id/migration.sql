-- Ensure reviews.tutorId exists (TutorProfile id). Prisma create() sends this value — DB must accept it.
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "tutorId" TEXT;

UPDATE "reviews" AS r
SET "tutorId" = b."tutorId"
FROM "bookings" AS b
WHERE r."bookingId" = b."id";

DELETE FROM "reviews" WHERE "tutorId" IS NULL;

ALTER TABLE "reviews" ALTER COLUMN "tutorId" SET NOT NULL;

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_tutorId_fkey";
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_tutorId_fkey"
  FOREIGN KEY ("tutorId") REFERENCES "tutor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "reviews_tutorId_idx";
CREATE INDEX "reviews_tutorId_idx" ON "reviews"("tutorId");
