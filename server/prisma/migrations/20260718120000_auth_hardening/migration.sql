-- Normalize legacy addresses before enforcing case-insensitive uniqueness.
-- Fail loudly instead of guessing which account should survive a collision.
DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(BTRIM("email"))
    FROM "User"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot normalize User.email: case-insensitive duplicates exist';
  END IF;
END $$;

UPDATE "User" SET "email" = LOWER(BTRIM("email"));
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (LOWER("email"));
