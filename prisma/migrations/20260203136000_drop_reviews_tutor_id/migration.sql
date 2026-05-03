-- Review.tutorId removed from Prisma schema; tutor comes from booking join.
-- Safe if these objects were never created.
DROP INDEX IF EXISTS "reviews_tutorId_idx";
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_tutorId_fkey";
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "tutorId";
