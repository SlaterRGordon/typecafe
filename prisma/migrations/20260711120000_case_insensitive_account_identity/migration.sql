-- Application checks are case-insensitive; enforce the same identity rule at
-- the database seam so concurrent registrations cannot create case variants.
CREATE UNIQUE INDEX "User_username_lower_key"
ON "User" (LOWER("username"))
WHERE "username" IS NOT NULL;
