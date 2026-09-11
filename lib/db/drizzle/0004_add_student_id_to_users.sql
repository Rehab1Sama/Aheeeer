ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "student_id" integer REFERENCES "students"("id");