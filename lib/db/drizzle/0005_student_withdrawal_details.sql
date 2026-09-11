ALTER TABLE "student_enrollments"
  ADD COLUMN IF NOT EXISTS "withdrawal_period" text,
  ADD COLUMN IF NOT EXISTS "withdrawal_reason" text,
  ADD COLUMN IF NOT EXISTS "withdrawal_notes" text;