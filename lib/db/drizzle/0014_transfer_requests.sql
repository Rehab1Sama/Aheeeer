-- طلبات نقل الطالبات (توافق عليها القائدة أو النائبة)
CREATE TABLE IF NOT EXISTS "transfer_requests" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "from_circle_id" integer,
  "to_circle_id" integer NOT NULL,
  "requested_by_id" integer NOT NULL,
  "note" text,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by_id" integer,
  "decision_note" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transfer_requests_status_idx" ON "transfer_requests" ("status");
