-- The UI is English-only: move every profile to 'en' and drop the 'id' enum value.
UPDATE "User" SET "locale" = 'en' WHERE "locale" <> 'en';

-- AlterEnum
BEGIN;
CREATE TYPE "Locale_new" AS ENUM ('en');
ALTER TABLE "public"."User" ALTER COLUMN "locale" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "locale" TYPE "Locale_new" USING ("locale"::text::"Locale_new");
ALTER TYPE "Locale" RENAME TO "Locale_old";
ALTER TYPE "Locale_new" RENAME TO "Locale";
DROP TYPE "public"."Locale_old";
ALTER TABLE "User" ALTER COLUMN "locale" SET DEFAULT 'en';
COMMIT;
