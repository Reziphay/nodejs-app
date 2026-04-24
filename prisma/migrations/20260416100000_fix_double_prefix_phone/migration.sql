-- Fix rows where the phone column ended up with a double prefix, e.g.
-- "+994+99423456789". This happened because the previous migration
-- concatenated country_prefix || phone on rows where phone already
-- contained the full E.164 number.
--
-- Detection: any phone that matches '+<digits>+<digits>' has a double prefix.
-- Fix:       strip everything up to and including the embedded second '+'.
--
-- Example: '+994+99423456789' → '+99423456789'

UPDATE "User"
SET phone = '+' || split_part(phone, '+', 3)
WHERE phone ~ '^\+[0-9]+\+[0-9]+$';
