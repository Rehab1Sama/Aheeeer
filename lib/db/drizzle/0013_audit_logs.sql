-- سجل التدقيق: من عدّل أو حذف، ومتى، وماذا
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "user_id" integer,
  "user_name" text,
  "role" text,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status" integer NOT NULL,
  "body" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_user_idx" ON "audit_logs" ("user_id");
