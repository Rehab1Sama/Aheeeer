ALTER TABLE "review_plans"
  ADD COLUMN IF NOT EXISTS "approval_status" text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "approved_by_id" integer,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cancellation_requested_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cancellation_requested_by_id" integer;

CREATE INDEX IF NOT EXISTS "review_plans_student_circle_type_status_idx"
  ON "review_plans" ("student_id", "circle_id", "plan_type", "status");