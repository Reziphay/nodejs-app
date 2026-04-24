-- Merge country_prefix + phone into a single full E.164 phone number.
--
-- Before: phone = '1234567', country_prefix = '+994'  → unique only on local number (BUG)
-- After:  phone = '+9941234567', country_prefix column removed → unique on full international number
--
-- Rows that already have a prefix are combined; rows with phone but no prefix
-- keep their existing value unchanged (legacy data, best-effort).

UPDATE "User"
SET phone = country_prefix || phone
WHERE phone IS NOT NULL
  AND country_prefix IS NOT NULL
  AND country_prefix <> '';

-- Remove the now-redundant column
ALTER TABLE "User" DROP COLUMN "country_prefix";

-- Add index on the full phone for faster lookups
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");
